import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { describe, expect, it, vi } from 'vitest';

import { fakeRecognitionWorker } from '@/test/fakeRecognitionWorker';

import type { FrameScheduler } from './frameScheduler';
import type { Landmarker } from './handLandmarker';
import { FRAME_INTERVAL_MS, SEQUENCE_LENGTH } from './landmarks';
import { createSignPolicy } from './SignClassifier';
import { WorkerSignRecognizer, type WorkerRecognizerOptions } from './WorkerSignRecognizer';

/** GRU mínima: con estos sesgos siempre gana `hello` (≈ 99 %). */
function weights() {
  const row = (n: number) => Array<number>(n).fill(0);
  return {
    format: 'senavoz-gru-v1',
    input_size: 126,
    hidden_size: 1,
    labels: ['hello', 'neutral'],
    gru: {
      weight_ih: [row(126), row(126), row(126)],
      weight_hh: [[0], [0], [0]],
      bias_ih: row(3),
      bias_hh: row(3),
    },
    head: { weight: [[0], [0]], bias: [5, 0] },
  };
}

const withHand = {
  landmarks: [
    Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.5 - i * 0.02, z: 0 })),
  ],
  worldLandmarks: [],
  handedness: [[{ categoryName: 'Left', score: 1, index: 0, displayName: 'Left' }]],
  handednesses: [],
} as unknown as HandLandmarkerResult;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(
  options: Partial<WorkerRecognizerOptions> & {
    landmarker?: () => Promise<Landmarker>;
  } = {},
) {
  const landmarker = { detectForVideo: vi.fn(() => withHand), close: vi.fn() };
  const worker = fakeRecognitionWorker(
    options.landmarker ?? (() => Promise.resolve(landmarker as Landmarker)),
  );
  const callbacks = new Map<number, (timestamp: number) => void>();
  let nextId = 0;
  const scheduler: FrameScheduler & { cancel: ReturnType<typeof vi.fn> } = {
    request: (_video, callback) => {
      callbacks.set(nextId, callback);
      return nextId++;
    },
    cancel: vi.fn((_video: HTMLVideoElement, id: number) => callbacks.delete(id)),
  };
  const bitmaps: { close: ReturnType<typeof vi.fn> }[] = [];
  const captureFrame = vi.fn(async () => {
    const bitmap = { close: vi.fn() };
    bitmaps.push(bitmap);
    return bitmap as unknown as ImageBitmap;
  });
  const video = { readyState: 4, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
  const recognizer = new WorkerSignRecognizer(video, {
    model: { weights: weights(), policy: createSignPolicy({ hello: 'hello' }) },
    spawnWorker: () => worker,
    scheduler,
    captureFrame,
    shareMemory: false,
    ...options,
  });
  let timestamp = 0;
  /** Llega un frame de la cámara (sin esperar a que se capture). */
  const advance = (step = FRAME_INTERVAL_MS) => {
    const [id, callback] = [...callbacks.entries()][0] ?? [];
    if (!callback) return;
    callbacks.delete(id!);
    timestamp += step;
    callback(timestamp);
  };
  /** Un frame y deja que el worker responda. */
  const frame = async (step?: number) => {
    advance(step);
    await flush();
    await flush();
  };
  return {
    recognizer,
    worker,
    video,
    scheduler,
    captureFrame,
    bitmaps,
    landmarker,
    advance,
    frame,
  };
}

async function started(options?: Parameters<typeof setup>[0]) {
  const h = setup(options);
  await h.recognizer.start();
  await flush(); // el worker crea MediaPipe y avisa
  return h;
}

describe('WorkerSignRecognizer', () => {
  it.each([true, false])('shareMemory=%s: init con o sin control compartido', async (shared) => {
    const h = setup({ shareMemory: shared });
    expect(h.recognizer.backpressure).toBe(shared ? 'shared' : 'message');
    await h.recognizer.start();
    const [init, setModel] = h.worker.received;
    expect(init.type === 'init' && init.control instanceof SharedArrayBuffer).toBe(shared);
    expect(setModel).toMatchObject({ type: 'setModel', diagnostics: false });
  });

  it('pasa a ready cuando MediaPipe arranca en el worker', async () => {
    const h = setup();
    const onStatus = vi.fn();
    h.recognizer.onStatus(onStatus);
    await h.recognizer.start();
    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'initializing',
      handsDetected: false,
      modelAvailable: true,
    });
    await flush();
    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'ready',
      handsDetected: false,
      modelAvailable: true,
    });
  });

  it.each([true, false])(
    'shareMemory=%s: transfiere cada frame y dice la seña reconocida',
    async (shared) => {
      const h = await started({ shareMemory: shared });
      const onSign = vi.fn();
      const onStatus = vi.fn();
      h.recognizer.onSign(onSign);
      h.recognizer.onStatus(onStatus);
      for (let i = 0; i < SEQUENCE_LENGTH; i += 1) await h.frame();

      expect(h.captureFrame).toHaveBeenCalledTimes(SEQUENCE_LENGTH);
      const frames = h.worker.received.filter((m) => m.type === 'frame');
      expect(frames).toHaveLength(SEQUENCE_LENGTH);
      // El worker cierra cada bitmap en cuanto MediaPipe lo ha leído.
      expect(h.bitmaps.every((b) => b.close.mock.calls.length === 1)).toBe(true);
      expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ handsDetected: true }));
      expect(onSign).toHaveBeenCalledOnce();
      expect(onSign.mock.calls[0][0]).toMatchObject({ code: 'hello' });
    },
  );

  it.each([true, false])(
    'shareMemory=%s: con el worker ocupado el frame se descarta, no se encola',
    async (shared) => {
      const h = await started({ shareMemory: shared });
      h.advance();
      h.advance(); // el anterior aún no ha llegado al worker
      await flush();
      await flush();
      expect(h.captureFrame).toHaveBeenCalledOnce();
      await h.frame(); // ya libre
      expect(h.captureFrame).toHaveBeenCalledTimes(2);
    },
  );

  it('no captura antes de que MediaPipe esté listo ni sin imagen en el vídeo', async () => {
    const h = setup();
    await h.recognizer.start();
    h.advance(); // MediaPipe aún no ha respondido
    await flush();
    Object.assign(h.video, { readyState: 1, videoWidth: 0 });
    await h.frame();
    expect(h.captureFrame).not.toHaveBeenCalled();
  });

  it('si la captura falla, el worker sigue libre para el siguiente frame', async () => {
    const h = await started({ shareMemory: true });
    h.captureFrame.mockRejectedValueOnce(new Error('resize'));
    await h.frame();
    await h.frame();
    expect(h.captureFrame).toHaveBeenCalledTimes(2);
    expect(h.worker.received.filter((m) => m.type === 'frame')).toHaveLength(1);
  });

  it('si MediaPipe no arranca en el worker, queda en error y lo termina', async () => {
    const h = setup({ landmarker: () => Promise.reject(new Error('wasm')) });
    const onStatus = vi.fn();
    h.recognizer.onStatus(onStatus);
    await h.recognizer.start();
    await flush();
    await flush();
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error' }));
    expect(h.worker.terminated).toBe(true);
  });

  it('stop avisa al worker, lo termina y suelta un bitmap que llegue tarde', async () => {
    const h = await started();
    h.advance();
    h.recognizer.stop();
    await flush();
    expect(h.worker.received.at(-1)).toEqual({ type: 'stop' });
    expect(h.worker.terminated).toBe(true);
    expect(h.scheduler.cancel).toHaveBeenCalled();
    expect(h.bitmaps[0].close).toHaveBeenCalled();
    expect(h.worker.received.some((m) => m.type === 'frame')).toBe(false);
  });

  it('setModel cambia el modelo del worker sin reiniciar la cámara', async () => {
    const h = await started();
    const onStatus = vi.fn();
    h.recognizer.onStatus(onStatus);
    h.recognizer.setModel(null);
    expect(h.worker.received.at(-1)).toEqual({
      type: 'setModel',
      weights: null,
      diagnostics: false,
    });
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ modelAvailable: false }));
    expect(h.worker.terminated).toBe(false);
  });

  it('con onProbabilities pide el diagnóstico y lo reenvía', async () => {
    const onProbabilities = vi.fn();
    const h = await started({ onProbabilities });
    expect(h.worker.received[1]).toMatchObject({ type: 'setModel', diagnostics: true });
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) await h.frame();
    expect(Object.keys(onProbabilities.mock.calls[0][0])).toEqual(['hello', 'neutral']);
  });
});
