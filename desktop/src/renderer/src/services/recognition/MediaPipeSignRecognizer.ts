import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import simdLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import simdWasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import noSimdLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url';
import noSimdWasmUrl from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url';

import { LandmarkSequenceBuffer, type DetectedHand } from './landmarks';
import type { SignClassifier } from './SignClassifier';
import type {
  RecognitionStatus,
  RecognizedSign,
  SignRecognizer,
  Unsubscribe,
} from './SignRecognizer';

export type Landmarker = Pick<HandLandmarker, 'detectForVideo' | 'close'>;
type FrameCallback = (timestamp: number) => void;

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

async function createDefaultLandmarker(): Promise<Landmarker> {
  const hasSimd = await FilesetResolver.isSimdSupported();
  const wasmFileset = hasSimd
    ? { wasmLoaderPath: simdLoaderUrl, wasmBinaryPath: simdWasmUrl }
    : { wasmLoaderPath: noSimdLoaderUrl, wasmBinaryPath: noSimdWasmUrl };
  const modelAssetPath = new URL('/models/hand_landmarker.task', window.location.href).toString();

  return HandLandmarker.createFromOptions(wasmFileset, {
    baseOptions: { modelAssetPath },
    runningMode: 'VIDEO',
    numHands: 2,
  });
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
  private readonly classifier: SignClassifier | null;
  private readonly sequence = new LandmarkSequenceBuffer();
  private readonly signListeners = new Set<(sign: RecognizedSign) => void>();
  private readonly statusListeners = new Set<(status: RecognitionStatus) => void>();
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
      this.sequence.add(hands);
      const detected = hands.length > 0;
      if (detected !== this.handsDetected) {
        this.handsDetected = detected;
        this.publishStatus({
          phase: 'ready',
          handsDetected: detected,
          modelAvailable: !!this.classifier,
        });
      }

      if (!this.classifier || !this.sequence.isReady || this.inferencePending) return;
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
