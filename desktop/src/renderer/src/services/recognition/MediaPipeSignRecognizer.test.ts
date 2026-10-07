import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

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
    h.landmarker.detectForVideo.mockReturnValue({
      landmarks: [Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))],
      worldLandmarks: [],
      handedness: [[{ categoryName: 'Left', score: 0.99, index: 0, displayName: 'Left' }]],
      handednesses: [[{ categoryName: 'Left', score: 0.99, index: 0, displayName: 'Left' }]],
    } as HandLandmarkerResult);
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

  it('normaliza timestamps repetidos y solo clasifica tras reunir 30 frames', async () => {
    const classifier: SignClassifier = { classify: vi.fn().mockResolvedValue(null) };
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier,
    });
    await recognizer.start();

    for (let i = 0; i < 30; i += 1) {
      h.advance(100);
      await Promise.resolve();
    }

    expect(h.landmarker.detectForVideo).toHaveBeenNthCalledWith(2, h.video, 101);
    expect(classifier.classify).toHaveBeenCalledTimes(1);
    expect(classifier.classify).toHaveBeenCalledWith(Array(30 * 126).fill(0));
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
    await recognizer.start();
    for (let i = 0; i < 30; i += 1) h.advance(100 + i);

    recognizer.stop();
    resolvePrediction({ code: 'hello', confidence: 0.99 });
    await Promise.resolve();
    await Promise.resolve();

    expect(onSign).not.toHaveBeenCalled();
  });
});
