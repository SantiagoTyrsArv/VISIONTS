import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

import { FRAME_INTERVAL_MS, SEQUENCE_LENGTH } from './landmarks';
import {
  MediaPipeSignRecognizer,
  type FrameScheduler,
  type Landmarker,
} from './MediaPipeSignRecognizer';
import type { SignClassifier } from './SignClassifier';
import type { RecognizedSign } from './SignRecognizer';

type Harness = {
  video: HTMLVideoElement;
  landmarker: Landmarker & {
    detectForVideo: ReturnType<
      typeof vi.fn<(videoFrame: TexImageSource, timestamp: number) => HandLandmarkerResult>
    >;
    close: ReturnType<typeof vi.fn<() => void>>;
  };
  scheduler: FrameScheduler & {
    request: ReturnType<
      typeof vi.fn<(video: HTMLVideoElement, callback: (timestamp: number) => void) => number>
    >;
    cancel: ReturnType<typeof vi.fn<(video: HTMLVideoElement, id: number) => void>>;
  };
  advance(timestamp?: number): void;
};

function makeHarness(): Harness {
  let nextId = 0;
  const callbacks = new Map<number, (timestamp: number) => void>();
  const video = { readyState: 4, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
  const landmarker = {
    detectForVideo: vi.fn(
      (): HandLandmarkerResult =>
        ({
          landmarks: [],
          worldLandmarks: [],
          handedness: [],
          handednesses: [],
        }) as HandLandmarkerResult,
    ),
    close: vi.fn(),
  };
  const scheduler = {
    request: vi.fn((_video: HTMLVideoElement, callback: (timestamp: number) => void): number => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
    cancel: vi.fn((_video: HTMLVideoElement, id: number): void => {
      callbacks.delete(id);
    }),
  };
  const advance = (timestamp = 1000): void => {
    const [id, callback] = [...callbacks.entries()][0] ?? [];
    if (callback) {
      callbacks.delete(id!);
      callback(timestamp);
    }
  };
  return { video, landmarker, scheduler, advance };
}

// Una mano degenerada (todo a 0) ya no cuenta como presente, de ahí los puntos distintos.
const handPoints = () =>
  Array.from({ length: 21 }, (_, i) => ({
    x: 0.5 + i * 0.01,
    y: 0.5 - i * 0.02,
    z: 0,
    visibility: 1,
  }));
const withHand = (): HandLandmarkerResult =>
  ({
    landmarks: [handPoints()],
    worldLandmarks: [],
    handedness: [[{ categoryName: 'Left', score: 1, index: 0, displayName: 'Left' }]],
    handednesses: [],
  }) as unknown as HandLandmarkerResult;

describe('MediaPipeSignRecognizer', () => {
  let h: ReturnType<typeof makeHarness>;

  beforeEach(() => {
    h = makeHarness();
  });

  it('detecta manos sobre frames de vídeo y expone cuando falta el modelo semántico', async () => {
    const onStatus = vi.fn();
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
    });
    recognizer.onStatus(onStatus);

    await recognizer.start();
    h.advance(100);

    expect(h.landmarker.detectForVideo).toHaveBeenCalledWith(h.video, 100);
    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'ready',
      handsDetected: false,
      modelAvailable: false,
    });
  });

  it('espera al vídeo listo y cierra recursos al detenerse, aunque se detenga dos veces', async () => {
    Object.assign(h.video, { readyState: 1, videoWidth: 0, videoHeight: 0 });
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
    });

    await recognizer.start();
    h.advance();
    expect(h.landmarker.detectForVideo).not.toHaveBeenCalled();

    recognizer.stop();
    recognizer.stop();
    expect(h.landmarker.close).toHaveBeenCalledTimes(1);
    expect(h.scheduler.cancel).toHaveBeenCalledTimes(1);
  });

  it('publica cuando MediaPipe encuentra una o más manos', async () => {
    h.landmarker.detectForVideo.mockReturnValue(withHand());
    const onStatus = vi.fn();
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
    });
    recognizer.onStatus(onStatus);

    await recognizer.start();
    h.advance();

    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'ready',
      handsDetected: true,
      modelAvailable: false,
    });
  });

  it('normaliza timestamps repetidos antes de llamar a MediaPipe', async () => {
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
    });
    await recognizer.start();

    h.advance(100);
    h.advance(100);

    expect(h.landmarker.detectForVideo).toHaveBeenNthCalledWith(1, h.video, 100);
    expect(h.landmarker.detectForVideo).toHaveBeenNthCalledWith(2, h.video, 101);
  });

  it('solo clasifica tras reunir 30 frames con manos', async () => {
    h.landmarker.detectForVideo.mockReturnValue(withHand());
    const classifier: SignClassifier = { classify: vi.fn().mockResolvedValue(null) };
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier,
    });
    await recognizer.start();

    for (let i = 0; i < SEQUENCE_LENGTH - 1; i += 1) h.advance(i * FRAME_INTERVAL_MS);
    expect(classifier.classify).not.toHaveBeenCalled();
    h.advance((SEQUENCE_LENGTH - 1) * FRAME_INTERVAL_MS);
    await Promise.resolve();

    expect(classifier.classify).toHaveBeenCalledTimes(1);
    expect(classifier.classify).toHaveBeenCalledWith(expect.arrayContaining([expect.any(Number)]));
    expect((classifier.classify as ReturnType<typeof vi.fn>).mock.calls[0][0]).toHaveLength(
      SEQUENCE_LENGTH * 126,
    );
  });

  it('no llena la ventana al ritmo de la cámara si va más rápida que FRAME_INTERVAL_MS', async () => {
    h.landmarker.detectForVideo.mockReturnValue(withHand());
    const classify = vi.fn(async () => null);
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier: { classify },
    });
    await recognizer.start();
    // Frames de cámara cada 1 ms: la ventana sigue muy lejos de tener 30 muestras.
    for (let i = 0; i < 2 * SEQUENCE_LENGTH; i += 1) h.advance(i);
    await Promise.resolve();
    expect(classify).not.toHaveBeenCalled();
  });

  it('toma un frame cada FRAME_INTERVAL_MS aunque la cámara dé más', async () => {
    h.landmarker.detectForVideo.mockReturnValue(withHand());
    const classify = vi.fn(async () => null);
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier: { classify },
    });
    await recognizer.start();
    // Cada muestra va seguida de un frame de cámara 1 ms después, que debe ignorarse.
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) {
      h.advance(i * FRAME_INTERVAL_MS);
      h.advance(i * FRAME_INTERVAL_MS + 1);
    }
    await Promise.resolve();
    expect(h.landmarker.detectForVideo).toHaveBeenCalledTimes(2 * SEQUENCE_LENGTH);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0] as unknown[]).toHaveLength(1);
    expect((classify.mock.calls[0] as unknown as number[][])[0]).toHaveLength(
      SEQUENCE_LENGTH * 126,
    );
  });

  it('no clasifica si no hay manos en toda la ventana', async () => {
    const classify = vi.fn(async () => null);
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier: { classify },
    });
    await recognizer.start();
    for (let i = 0; i < SEQUENCE_LENGTH + 5; i += 1) h.advance(i * FRAME_INTERVAL_MS);
    await Promise.resolve();
    expect(classify).not.toHaveBeenCalled();
  });

  it('cierra el landmarker que termina de cargar después de stop', async () => {
    let resolveFactory!: (value: typeof h.landmarker) => void;
    const createLandmarker = vi.fn(
      () => new Promise<typeof h.landmarker>((resolve) => (resolveFactory = resolve)),
    );
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker,
      scheduler: h.scheduler,
    });
    const starting = recognizer.start();
    recognizer.stop();
    resolveFactory(h.landmarker);
    await starting;

    expect(h.landmarker.close).toHaveBeenCalledTimes(1);
    expect(h.scheduler.request).not.toHaveBeenCalled();
  });

  it('no emite una predicción atrasada después de detenerse', async () => {
    let resolvePrediction!: (value: RecognizedSign | null) => void;
    const classifier: SignClassifier = {
      classify: vi.fn(
        (): Promise<RecognizedSign | null> =>
          new Promise((resolve) => (resolvePrediction = resolve)),
      ),
    };
    const onSign = vi.fn();
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier,
    });
    recognizer.onSign(onSign);
    h.landmarker.detectForVideo.mockReturnValue(withHand());
    await recognizer.start();
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) h.advance(i * FRAME_INTERVAL_MS);

    recognizer.stop();
    resolvePrediction({ code: 'hello', confidence: 0.99 });
    await Promise.resolve();
    await Promise.resolve();

    expect(onSign).not.toHaveBeenCalled();
  });

  it('cambia de clasificador sin reiniciar la cámara y lo refleja en el estado', async () => {
    const onStatus = vi.fn();
    const classifier: SignClassifier = {
      classify: vi.fn().mockResolvedValue({ code: 'yes', confidence: 0.95 }),
    };
    const onSign = vi.fn();
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
    });
    recognizer.onStatus(onStatus);
    recognizer.onSign(onSign);
    h.landmarker.detectForVideo.mockReturnValue(withHand());
    await recognizer.start();

    recognizer.setClassifier(classifier);
    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'ready',
      handsDetected: false,
      modelAvailable: true,
    });
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) {
      h.advance(i * FRAME_INTERVAL_MS);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(onSign).toHaveBeenCalledWith({ code: 'yes', confidence: 0.95 });
    expect(h.landmarker.close).not.toHaveBeenCalled();

    recognizer.setClassifier(null);
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ modelAvailable: false }));
  });
});
