import { HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import simdLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import simdWasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';

import { LandmarkSequenceBuffer, type DetectedHand } from './landmarks';
import type { SignClassifier } from './SignClassifier';
import type {
  LandmarkFrame,
  RecognitionStatus,
  RecognizedSign,
  SignRecognizer,
  Unsubscribe,
} from './SignRecognizer';

export type Landmarker = Pick<HandLandmarker, 'detectForVideo' | 'close'>;
type FrameCallback = (timestamp: number) => void;

/** Se clasifica uno de cada 3 frames para no cargar la CPU durante las reuniones. */
export const INFERENCE_STRIDE = 3;

export type FrameScheduler = {
  request(video: HTMLVideoElement, callback: FrameCallback): number;
  cancel(video: HTMLVideoElement, id: number): void;
};

const frameScheduler: FrameScheduler = {
  request(video, callback) {
    if (video.requestVideoFrameCallback) {
      return video.requestVideoFrameCallback((_now, metadata) =>
        callback(metadata.mediaTime * 1000),
      );
    }
    return requestAnimationFrame(callback);
  },
  cancel(video, id) {
    if (video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(id);
    else cancelAnimationFrame(id);
  },
};

// Solo se empaqueta el WASM con SIMD: cualquier PC con Windows 10/11 x64 lo admite.
async function createDefaultLandmarker(): Promise<Landmarker> {
  const modelAssetPath = new URL('/models/hand_landmarker.task', window.location.href).toString();
  return HandLandmarker.createFromOptions(
    { wasmLoaderPath: simdLoaderUrl, wasmBinaryPath: simdWasmUrl },
    { baseOptions: { modelAssetPath }, runningMode: 'VIDEO', numHands: 2 },
  );
}

function toDetectedHands(result: HandLandmarkerResult): DetectedHand[] {
  return result.landmarks.map((landmarks, index) => {
    const category = result.handedness[index]?.[0]?.categoryName;
    return {
      landmarks,
      ...(category === 'Left' || category === 'Right' ? { handedness: category } : {}),
    };
  });
}

export type MediaPipeRecognizerOptions = {
  createLandmarker?: () => Promise<Landmarker>;
  scheduler?: FrameScheduler;
  classifier?: SignClassifier | null;
};

/** Local hand landmarks plus an optional trained sign classifier. */
export class MediaPipeSignRecognizer implements SignRecognizer {
  private readonly createLandmarker: () => Promise<Landmarker>;
  private readonly scheduler: FrameScheduler;
  private classifier: SignClassifier | null;
  private readonly sequence = new LandmarkSequenceBuffer();
  private readonly signListeners = new Set<(sign: RecognizedSign) => void>();
  private readonly statusListeners = new Set<(status: RecognitionStatus) => void>();
  private readonly frameListeners = new Set<(frame: LandmarkFrame) => void>();
  private framesSinceInference = INFERENCE_STRIDE;
  private landmarker: Landmarker | null = null;
  private frameId: number | null = null;
  private running = false;
  private inferencePending = false;
  private generation = 0;
  private previousTimestamp = -1;
  private handsDetected = false;
  private status: RecognitionStatus = {
    phase: 'initializing',
    handsDetected: false,
    modelAvailable: false,
  };

  constructor(
    private readonly video: HTMLVideoElement,
    options: MediaPipeRecognizerOptions = {},
  ) {
    this.createLandmarker = options.createLandmarker ?? createDefaultLandmarker;
    this.scheduler = options.scheduler ?? frameScheduler;
    this.classifier = options.classifier ?? null;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    const generation = this.generation;
    this.sequence.clear();
    this.previousTimestamp = -1;
    this.framesSinceInference = INFERENCE_STRIDE;
    this.publishStatus({
      phase: 'initializing',
      handsDetected: false,
      modelAvailable: !!this.classifier,
    });

    try {
      const landmarker = await this.createLandmarker();
      if (!this.running || generation !== this.generation) {
        landmarker.close();
        return;
      }
      this.landmarker = landmarker;
      this.publishStatus({
        phase: 'ready',
        handsDetected: false,
        modelAvailable: !!this.classifier,
      });
      this.scheduleNextFrame();
    } catch {
      if (this.running && generation === this.generation) this.fail();
    }
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    this.inferencePending = false;
    if (this.frameId !== null) {
      this.scheduler.cancel(this.video, this.frameId);
      this.frameId = null;
    }
    const landmarker = this.landmarker;
    this.landmarker = null;
    landmarker?.close();
    this.sequence.clear();
  }

  onSign(callback: (sign: RecognizedSign) => void): Unsubscribe {
    this.signListeners.add(callback);
    return () => this.signListeners.delete(callback);
  }

  onStatus(callback: (status: RecognitionStatus) => void): Unsubscribe {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  /** Cambia el modelo sin reiniciar la cámara (p. ej. al terminar un entrenamiento). */
  setClassifier(classifier: SignClassifier | null): void {
    this.classifier = classifier;
    this.publishStatus({ ...this.status, modelAvailable: !!classifier });
  }

  onFrame(callback: (frame: LandmarkFrame) => void): Unsubscribe {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }

  private scheduleNextFrame(): void {
    if (!this.running || this.frameId !== null) return;
    this.frameId = this.scheduler.request(this.video, (timestamp) => {
      this.frameId = null;
      this.processFrame(timestamp);
      this.scheduleNextFrame();
    });
  }

  private processFrame(timestamp: number): void {
    const landmarker = this.landmarker;
    if (!this.running || !landmarker) return;
    if (
      this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !this.video.videoWidth ||
      !this.video.videoHeight
    ) {
      return;
    }

    try {
      const monotonicTimestamp = Math.max(Math.floor(timestamp), this.previousTimestamp + 1);
      this.previousTimestamp = monotonicTimestamp;
      const result = landmarker.detectForVideo(this.video, monotonicTimestamp);
      const hands = toDetectedHands(result);
      const values = this.sequence.add(hands);
      const detected = hands.length > 0;
      this.frameListeners.forEach((callback) => callback({ values, handsDetected: detected }));
      if (detected !== this.handsDetected) {
        this.handsDetected = detected;
        this.publishStatus({
          phase: 'ready',
          handsDetected: detected,
          modelAvailable: !!this.classifier,
        });
      }

      this.framesSinceInference += 1;
      if (
        !this.classifier ||
        !this.sequence.isReady ||
        this.inferencePending ||
        this.framesSinceInference < INFERENCE_STRIDE
      ) {
        return;
      }
      this.framesSinceInference = 0;
      this.inferencePending = true;
      const generation = this.generation;
      void this.classifier
        .classify(this.sequence.toArray())
        .then((sign) => {
          if (sign && this.running && generation === this.generation) {
            this.signListeners.forEach((callback) => callback(sign));
          }
        })
        .catch(() => {
          if (generation === this.generation) this.fail();
        })
        .finally(() => {
          if (generation === this.generation) this.inferencePending = false;
        });
    } catch {
      this.fail();
    }
  }

  private publishStatus(status: RecognitionStatus): void {
    this.status = status;
    this.statusListeners.forEach((callback) => callback(status));
  }

  private fail(): void {
    this.stop();
    this.publishStatus({ phase: 'error', handsDetected: false, modelAvailable: !!this.classifier });
  }
}
