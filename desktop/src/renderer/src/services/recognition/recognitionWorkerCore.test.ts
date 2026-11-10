import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { describe, expect, it, vi } from 'vitest';

import {
  CTRL_BUSY,
  CTRL_BYTES,
  type FromWorkerMessage,
  type PredictionMessage,
} from '../../../../shared/recognitionProtocol';

import fixture from './__fixtures__/gru-parity.json';
import type { Landmarker } from './handLandmarker';
import { FRAME_INTERVAL_MS, SEQUENCE_LENGTH } from './landmarks';
import { createRecognitionWorker } from './recognitionWorkerCore';

const handPoints = () =>
  Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.5 - i * 0.02, z: 0 }));
const withHand = {
  landmarks: [handPoints()],
  worldLandmarks: [],
  handedness: [[{ categoryName: 'Left', score: 1, index: 0, displayName: 'Left' }]],
  handednesses: [],
} as unknown as HandLandmarkerResult;
const noHands = {
  landmarks: [],
  worldLandmarks: [],
  handedness: [],
  handednesses: [],
} as unknown as HandLandmarkerResult;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap & { close: () => void };

function setup(options: { landmarker?: Promise<Landmarker>; shared?: boolean } = {}) {
  const posted: FromWorkerMessage[] = [];
  let result: HandLandmarkerResult = withHand;
  const landmarker = {
    detectForVideo: vi.fn<(frame: TexImageSource, timestamp: number) => HandLandmarkerResult>(
      () => result,
    ),
    close: vi.fn(),
  };
  const host = {
    post: (m: FromWorkerMessage) => posted.push(m),
    close: vi.fn(),
    now: () => 1000,
    createLandmarker: () => options.landmarker ?? Promise.resolve(landmarker as Landmarker),
  };
  const core = createRecognitionWorker(host);
  const control = options.shared ? new Int32Array(new SharedArrayBuffer(CTRL_BYTES)) : null;
  let id = 0;
  let timestamp = 0;
  /** Un frame de cámara; por defecto, al ritmo de muestreo de la ventana. */
  const frame = (step = FRAME_INTERVAL_MS) => {
    const b = bitmap();
    id += 1;
    timestamp += step;
    if (control) Atomics.store(control, CTRL_BUSY, 1); // lo reservó el hilo principal
    core.handle({ type: 'frame', id, bitmap: b, timestamp });
    return b;
  };
  return {
    core,
    host,
    posted,
    landmarker,
    control,
    frame,
    setHands: (r: HandLandmarkerResult) => (result = r),
    of: <T extends FromWorkerMessage['type']>(type: T) =>
      posted.filter((m): m is Extract<FromWorkerMessage, { type: T }> => m.type === type),
    async init() {
      core.handle({
        type: 'init',
        control: control ? (control.buffer as SharedArrayBuffer) : null,
      });
      await flush();
    },
  };
}

describe('createRecognitionWorker', () => {
  it('crea MediaPipe al iniciar y avisa; si falla, lo dice', async () => {
    const ok = setup();
    await ok.init();
    expect(ok.of('landmarker')).toEqual([{ type: 'landmarker', ok: true }]);

    const ko = setup({ landmarker: Promise.reject(new Error('wasm')) });
    await ko.init();
    expect(ko.of('landmarker')).toEqual([{ type: 'landmarker', ok: false, error: 'Error: wasm' }]);
  });

  it('con memoria compartida libera el frame con Atomics, sin mensajes', async () => {
    const w = setup({ shared: true });
    await w.init();
    const b = w.frame();
    expect(Atomics.load(w.control!, CTRL_BUSY)).toBe(0);
    expect(w.of('frameDone')).toHaveLength(0);
    expect(b.close).toHaveBeenCalled();
  });

  it('sin memoria compartida confirma cada frame con frameDone', async () => {
    const w = setup();
    await w.init();
    w.frame();
    w.frame(1);
    expect(w.of('frameDone')).toEqual([
      { type: 'frameDone', frameId: 1 },
      { type: 'frameDone', frameId: 2 },
    ]);
  });

  it('avisa de las manos solo cuando cambia', async () => {
    const w = setup();
    await w.init();
    w.frame();
    w.frame();
    w.setHands(noHands);
    w.frame();
    expect(w.of('hands').map((m) => m.detected)).toEqual([true, false]);
  });

  it('pasa a MediaPipe timestamps estrictamente crecientes', async () => {
    const w = setup();
    await w.init();
    w.frame(10.7);
    w.frame(0); // mismo mediaTime: MediaPipe lo rechazaría
    const timestamps = w.landmarker.detectForVideo.mock.calls.map(([, t]) => t);
    expect(timestamps).toEqual([10, 11]);
  });

  it('predice con la ventana muestreada a ritmo fijo y publica probabilidades si se piden', async () => {
    const w = setup();
    await w.init();
    w.core.handle({ type: 'setModel', weights: fixture.weights, diagnostics: true });
    expect(w.of('model')).toEqual([{ type: 'model', ok: true, labels: fixture.weights.labels }]);

    for (let i = 0; i < SEQUENCE_LENGTH - 1; i += 1) {
      w.frame();
      w.frame(1); // entre muestras: MediaPipe corre, pero no entra en la ventana
    }
    expect(w.of('prediction')).toHaveLength(0);
    w.frame();

    const [prediction] = w.of('prediction') as PredictionMessage[];
    expect(prediction.frameId).toBe(SEQUENCE_LENGTH * 2 - 1);
    expect(fixture.weights.labels).toContain(prediction.prediction?.label);
    expect(Object.keys(prediction.probabilities!)).toEqual(fixture.weights.labels);
    expect(prediction.timing).toEqual({
      receivedAt: 1000,
      detectStart: 1000,
      detectEnd: 1000,
      inferStart: 1000,
      inferEnd: 1000,
    });
  });

  it('un modelo que llega tarde aprovecha los frames ya reunidos', async () => {
    const w = setup();
    await w.init();
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) w.frame();
    expect(w.of('prediction')).toHaveLength(0);
    w.core.handle({ type: 'setModel', weights: fixture.weights, diagnostics: false });
    w.frame();
    const [prediction] = w.of('prediction');
    expect(prediction.probabilities).toBeUndefined();
    expect(prediction.prediction).not.toBeNull();
  });

  it('sin manos en la ventana no infiere', async () => {
    const w = setup();
    await w.init();
    w.core.handle({ type: 'setModel', weights: fixture.weights, diagnostics: false });
    w.setHands(noHands);
    for (let i = 0; i < SEQUENCE_LENGTH + 5; i += 1) w.frame();
    expect(w.of('prediction')).toHaveLength(0);
  });

  it('rechaza pesos inválidos y con null deja de predecir', async () => {
    const w = setup();
    await w.init();
    w.core.handle({ type: 'setModel', weights: { format: 'otro' }, diagnostics: false });
    expect(w.of('model')[0]).toMatchObject({ ok: false });

    w.core.handle({ type: 'setModel', weights: fixture.weights, diagnostics: false });
    w.core.handle({ type: 'setModel', weights: null, diagnostics: false });
    for (let i = 0; i < SEQUENCE_LENGTH + 1; i += 1) w.frame();
    expect(w.of('prediction')).toHaveLength(0);
  });

  it('si MediaPipe falla en un frame, avisa, cierra el bitmap y queda libre', async () => {
    const w = setup({ shared: true });
    await w.init();
    w.landmarker.detectForVideo.mockImplementationOnce(() => {
      throw new Error('gpu');
    });
    const b = w.frame();
    expect(w.of('error')).toEqual([{ type: 'error', error: 'Error: gpu' }]);
    expect(b.close).toHaveBeenCalled();
    expect(Atomics.load(w.control!, CTRL_BUSY)).toBe(0);
  });

  it('stop cierra MediaPipe y el worker; lo que llegue después solo libera el bitmap', async () => {
    const w = setup();
    await w.init();
    w.core.handle({ type: 'stop' });
    expect(w.landmarker.close).toHaveBeenCalled();
    expect(w.host.close).toHaveBeenCalled();
    const b = w.frame();
    expect(b.close).toHaveBeenCalled();
    expect(w.landmarker.detectForVideo).not.toHaveBeenCalled();
    expect(w.of('frameDone')).toHaveLength(0);
  });

  it('si se para antes de que MediaPipe esté listo, lo cierra al llegar', async () => {
    let resolve!: (l: Landmarker) => void;
    const w = setup({ landmarker: new Promise((r) => (resolve = r)) });
    void w.init();
    w.core.handle({ type: 'stop' });
    resolve(w.landmarker as Landmarker);
    await flush();
    expect(w.landmarker.close).toHaveBeenCalled();
    expect(w.of('landmarker')).toHaveLength(0);
  });
});
