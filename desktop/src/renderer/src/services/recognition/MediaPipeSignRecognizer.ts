import { loopTrace } from './eventLoopTrace';
import { frameScheduler, type FrameScheduler } from './frameScheduler';
import { createDefaultLandmarker, toDetectedHands, type Landmarker } from './handLandmarker';
import { FRAME_INTERVAL_MS, LandmarkSequenceBuffer } from './landmarks';
import type { SignClassifier } from './SignClassifier';
import type {
  RecognitionStatus,
  RecognizedSign,
  SignRecognizer,
  Unsubscribe,
} from './SignRecognizer';

export type { FrameScheduler, Landmarker };

export type MediaPipeRecognizerOptions = {
  createLandmarker?: () => Promise<Landmarker>;
  scheduler?: FrameScheduler;
  classifier?: SignClassifier | null;
};

/**
 * Todo en el hilo principal: MediaPipe y la GRU dentro de la task de cada frame. Es el modo
 * «antes» con el que el panel Diagnóstico compara el INP de WorkerSignRecognizer.
 */
export class MediaPipeSignRecognizer implements SignRecognizer {
  private readonly createLandmarker: () => Promise<Landmarker>;
  private readonly scheduler: FrameScheduler;
  private classifier: SignClassifier | null;
  private readonly sequence = new LandmarkSequenceBuffer();
  private readonly signListeners = new Set<(sign: RecognizedSign) => void>();
  private readonly statusListeners = new Set<(status: RecognitionStatus) => void>();
  private lastSampleAt = -Infinity;
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
    this.classifier?.reset();
    this.previousTimestamp = -1;
    this.lastSampleAt = -Infinity;
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
    this.classifier?.reset();
    this.lastSampleAt = -Infinity;
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
    // El nuevo modelo tiene su propia ventana: se le pasan los frames ya reunidos.
    classifier?.reset();
    this.sequence.frames().forEach((frame) => classifier?.push(frame));
    this.publishStatus({ ...this.status, modelAvailable: !!classifier });
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
    // Inicio de la task de requestVideoFrameCallback (para la traza del event loop).
    const frameStart = performance.now();
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
      const detectStart = performance.now();
      const result = landmarker.detectForVideo(this.video, monotonicTimestamp);
      const detectEnd = performance.now();
      const hands = toDetectedHands(result);
      const detected = hands.length > 0;
      if (detected !== this.handsDetected) {
        this.handsDetected = detected;
        this.publishStatus({
          phase: 'ready',
          handsDetected: detected,
          modelAvailable: !!this.classifier,
        });
      }

      // La ventana se llena a ritmo fijo, no al de la cámara (ver FRAME_INTERVAL_MS).
      if (monotonicTimestamp - this.lastSampleAt < FRAME_INTERVAL_MS) return;
      this.lastSampleAt = monotonicTimestamp;
      // El frame va a la ventana del modelo (en el worker: al SharedArrayBuffer).
      this.classifier?.push(this.sequence.add(hands));

      if (
        !this.classifier ||
        !this.sequence.isReady ||
        !this.sequence.hasHands() ||
        this.inferencePending
      ) {
        return;
      }
      this.inferencePending = true;
      const generation = this.generation;
      loopTrace.begin(frameStart);
      loopTrace.mark('detectMain', 'sync', detectStart, detectEnd);
      // classify() ejecuta la GRU de forma síncrona antes de su primer await.
      const inferStart = performance.now();
      const classifying = this.classifier.classify();
      loopTrace.mark('inferMain', 'sync', inferStart, performance.now());
      void classifying
        .then((sign) => {
          // Microtask: corre en cuanto termina esta task del frame.
          loopTrace.mark('then', 'microtask', performance.now());
          loopTrace.end();
          if (sign && this.running && generation === this.generation) {
            this.signListeners.forEach((callback) => callback(sign));
          }
        })
        .catch(() => {
          loopTrace.end();
          if (generation === this.generation) this.fail();
        })
        .finally(() => {
          if (generation === this.generation) this.inferencePending = false;
        });
      loopTrace.mark('frame', 'task', frameStart, performance.now());
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
