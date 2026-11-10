import {
  CTRL_BUSY,
  CTRL_BYTES,
  type Backpressure,
  type FromWorkerMessage,
  type PredictionMessage,
  type ToWorkerMessage,
} from '../../../../shared/recognitionProtocol';
import type { ClassProbabilities } from './diagnostics';
import { fromEpoch, loopTrace } from './eventLoopTrace';
import { frameScheduler, type FrameScheduler } from './frameScheduler';
import type { SignPolicy } from './SignClassifier';
import type {
  RecognitionStatus,
  RecognizedSign,
  SignRecognizer,
  Unsubscribe,
} from './SignRecognizer';

/** Lo que se usa de `Worker`; en los tests, un doble. */
export type WorkerPort = {
  postMessage(message: ToWorkerMessage, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<FromWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};

/** Pesos para el worker y política para decidir aquí qué frase se dice. */
export type WorkerSignModel = { weights: unknown; policy: SignPolicy };

/** Worker real, empaquetado por Vite como módulo aparte. */
export function spawnRecognitionWorker(): WorkerPort {
  return new Worker(new URL('./recognition.worker.ts', import.meta.url), {
    type: 'module',
    name: 'senavoz-recognition',
  }) as unknown as WorkerPort;
}

/** SharedArrayBuffer solo existe con crossOriginIsolated (COOP + COEP, ver main/index.ts). */
export const canShareMemory = (): boolean =>
  globalThis.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function';

export type WorkerRecognizerOptions = {
  model?: WorkerSignModel | null;
  spawnWorker?: () => WorkerPort;
  scheduler?: FrameScheduler;
  captureFrame?: (video: HTMLVideoElement) => Promise<ImageBitmap>;
  shareMemory?: boolean;
  onProbabilities?: (probabilities: ClassProbabilities) => void;
};

/** Tiempos de los últimos frames enviados, para reconstruir la traza al llegar la predicción. */
type SentFrame = { frameStart: number; frameEnd: number; postedAt: number };
const TRACKED_FRAMES = 8;

/**
 * MediaPipe y la GRU corren en recognition.worker.ts. El hilo principal solo captura cada
 * frame como ImageBitmap, lo transfiere y aplica la política a las predicciones que vuelven.
 * Si el worker sigue ocupado con el frame anterior, el nuevo se descarta (no se encola).
 */
export class WorkerSignRecognizer implements SignRecognizer {
  readonly backpressure: Backpressure;
  private readonly spawnWorker: () => WorkerPort;
  private readonly scheduler: FrameScheduler;
  private readonly captureFrame: (video: HTMLVideoElement) => Promise<ImageBitmap>;
  private readonly onProbabilities?: (probabilities: ClassProbabilities) => void;
  private readonly signListeners = new Set<(sign: RecognizedSign) => void>();
  private readonly statusListeners = new Set<(status: RecognitionStatus) => void>();
  private readonly sent = new Map<number, SentFrame>();
  private model: WorkerSignModel | null;
  private worker: WorkerPort | null = null;
  private control: Int32Array | null = null;
  /** Ocupado sin memoria compartida (se libera con `frameDone`). */
  private busy = false;
  private frameId = 0;
  private scheduled: number | null = null;
  private running = false;
  private landmarkerReady = false;
  private status: RecognitionStatus = {
    phase: 'initializing',
    handsDetected: false,
    modelAvailable: false,
  };

  constructor(
    private readonly video: HTMLVideoElement,
    options: WorkerRecognizerOptions = {},
  ) {
    this.model = options.model ?? null;
    this.spawnWorker = options.spawnWorker ?? spawnRecognitionWorker;
    this.scheduler = options.scheduler ?? frameScheduler;
    this.captureFrame = options.captureFrame ?? ((v) => createImageBitmap(v));
    this.onProbabilities = options.onProbabilities;
    this.backpressure = (options.shareMemory ?? canShareMemory()) ? 'shared' : 'message';
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.landmarkerReady = false;
    this.busy = false;
    this.sent.clear();
    this.publishStatus({
      phase: 'initializing',
      handsDetected: false,
      modelAvailable: !!this.model,
    });

    const worker = this.spawnWorker();
    this.worker = worker;
    this.control =
      this.backpressure === 'shared' ? new Int32Array(new SharedArrayBuffer(CTRL_BYTES)) : null;
    worker.onmessage = (event) => this.onMessage(event.data);
    worker.onerror = () => this.fail();
    worker.postMessage({
      type: 'init',
      control: this.control ? (this.control.buffer as SharedArrayBuffer) : null,
    });
    this.sendModel();
    this.scheduleNextFrame();
  }

  stop(): void {
    if (!this.running && !this.worker) return;
    this.running = false;
    if (this.scheduled !== null) {
      this.scheduler.cancel(this.video, this.scheduled);
      this.scheduled = null;
    }
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.postMessage({ type: 'stop' });
      worker.terminate();
    }
    this.control = null;
    this.sent.clear();
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

  /** Cambia el modelo sin reiniciar la cámara (p. ej. cuando termina de cargar). */
  setModel(model: WorkerSignModel | null): void {
    this.model = model;
    this.sendModel();
    this.publishStatus({ ...this.status, modelAvailable: !!model });
  }

  private sendModel(): void {
    this.worker?.postMessage({
      type: 'setModel',
      weights: this.model?.weights ?? null,
      diagnostics: !!this.onProbabilities,
    });
  }

  /** Reserva el worker para un frame; false si sigue con el anterior. */
  private acquire(): boolean {
    if (this.control) return Atomics.compareExchange(this.control, CTRL_BUSY, 0, 1) === 0;
    if (this.busy) return false;
    this.busy = true;
    return true;
  }

  private releaseLocally(): void {
    if (this.control) Atomics.store(this.control, CTRL_BUSY, 0);
    else this.busy = false;
  }

  private scheduleNextFrame(): void {
    if (!this.running || this.scheduled !== null) return;
    this.scheduled = this.scheduler.request(this.video, (timestamp) => {
      this.scheduled = null;
      this.onFrame(timestamp);
      this.scheduleNextFrame();
    });
  }

  private onFrame(timestamp: number): void {
    const frameStart = performance.now();
    const worker = this.worker;
    if (!this.running || !worker || !this.landmarkerReady) return;
    if (
      this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      !this.video.videoWidth ||
      !this.video.videoHeight
    ) {
      return;
    }
    // Worker ocupado con el frame anterior: este se descarta en vez de encolarse.
    if (!this.acquire()) return;
    const id = (this.frameId += 1);
    const capturing = this.captureFrame(this.video);
    const frameEnd = performance.now();
    capturing
      .then((bitmap) => {
        if (!this.running || this.worker !== worker) {
          bitmap.close();
          return;
        }
        const postedAt = performance.now();
        // Transferido, no copiado: después de esto el bitmap es del worker.
        worker.postMessage({ type: 'frame', id, bitmap, timestamp }, [bitmap]);
        this.sent.set(id, { frameStart, frameEnd, postedAt });
        this.sent.delete(id - TRACKED_FRAMES);
      })
      .catch(() => {
        // Sin frame (vídeo cambiando de tamaño, cámara cerrándose): el worker sigue libre.
        if (this.worker === worker) this.releaseLocally();
      });
  }

  private onMessage(message: FromWorkerMessage): void {
    switch (message.type) {
      case 'landmarker':
        if (!message.ok) {
          this.fail();
          return;
        }
        this.landmarkerReady = true;
        this.publishStatus({ phase: 'ready', handsDetected: false, modelAvailable: !!this.model });
        return;
      case 'model':
        if (!message.ok) this.publishStatus({ ...this.status, modelAvailable: false });
        return;
      case 'hands':
        if (this.status.phase === 'ready') {
          this.publishStatus({ ...this.status, handsDetected: message.detected });
        }
        return;
      case 'frameDone':
        this.busy = false;
        return;
      case 'prediction':
        this.onPrediction(message);
        return;
      case 'error':
        this.fail();
        return;
    }
  }

  /** `message` del worker: una task del hilo principal. Aquí se decide si se dice la frase. */
  private onPrediction(message: PredictionMessage): void {
    const handledAt = performance.now();
    if (message.probabilities) this.onProbabilities?.(message.probabilities);
    const sign = this.model?.policy(message.prediction) ?? null;
    if (sign && this.running) this.signListeners.forEach((callback) => callback(sign));
    this.trace(message, handledAt);
  }

  private trace(message: PredictionMessage, handledAt: number): void {
    const sent = this.sent.get(message.frameId);
    if (!sent) return;
    const t = message.timing;
    const now = performance.now();
    loopTrace.record(
      sent.frameStart,
      [
        { id: 'frame', kind: 'task', start: sent.frameStart, end: sent.frameEnd },
        { id: 'capture', kind: 'microtask', start: sent.frameEnd, end: sent.postedAt },
        {
          id: 'workerDetect',
          kind: 'worker',
          start: fromEpoch(t.detectStart),
          end: fromEpoch(t.detectEnd),
        },
        {
          id: 'workerInfer',
          kind: 'worker',
          start: fromEpoch(t.inferStart),
          end: fromEpoch(t.inferEnd),
        },
        { id: 'message', kind: 'task', start: handledAt, end: now },
      ],
      now,
    );
  }

  private publishStatus(status: RecognitionStatus): void {
    this.status = status;
    this.statusListeners.forEach((callback) => callback(status));
  }

  private fail(): void {
    this.stop();
    this.publishStatus({ phase: 'error', handsDetected: false, modelAvailable: !!this.model });
  }
}
