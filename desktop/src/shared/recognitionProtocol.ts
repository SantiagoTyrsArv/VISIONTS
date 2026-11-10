/**
 * Protocolo entre el hilo principal del renderer y recognition.worker.ts.
 *
 * El worker hace todo el reconocimiento: MediaPipe (manos) y la GRU (señas). El hilo
 * principal solo captura cada frame de la cámara como ImageBitmap y lo transfiere.
 *
 * Contrapresión: si el worker aún procesa el frame anterior, el siguiente se descarta en vez
 * de encolarse. Con crossOriginIsolated, el estado «ocupado» vive en un SharedArrayBuffer que
 * el hilo principal lee con Atomics sin esperar mensajes, y el worker no necesita responder a
 * cada frame. Sin aislamiento, el worker confirma cada frame con `frameDone`.
 *
 * Control y resultados van por postMessage, con los tipos de este archivo.
 */

/** Posiciones del `Int32Array` de control (compartido). */
export const CTRL_BUSY = 0; // 1 mientras el worker procesa un frame
export const CTRL_LENGTH = 1;
export const CTRL_BYTES = CTRL_LENGTH * Int32Array.BYTES_PER_ELEMENT;

/** Cómo se entera el hilo principal de que el worker está libre. */
export type Backpressure = 'shared' | 'message';

export type ModelPrediction = { label: string; confidence: number };

// ---- Hilo principal → worker -------------------------------------------------------------

/** `control`: SharedArrayBuffer de CTRL_BYTES, o null sin crossOriginIsolated. */
export type InitMessage = { type: 'init'; control: SharedArrayBuffer | null };
/** Pesos tal como salen de sign-model.json (null: sin modelo); el worker los valida. */
export type SetModelMessage = { type: 'setModel'; weights: unknown; diagnostics: boolean };
/** Un frame de la cámara, transferido (no copiado). `timestamp`: mediaTime del frame en ms. */
export type FrameMessage = { type: 'frame'; id: number; bitmap: ImageBitmap; timestamp: number };
export type StopMessage = { type: 'stop' };

export type ToWorkerMessage = InitMessage | SetModelMessage | FrameMessage | StopMessage;

// ---- Worker → hilo principal -------------------------------------------------------------

/** MediaPipe listo (o no se pudo crear). */
export type LandmarkerMessage = { type: 'landmarker'; ok: boolean; error?: string };
export type ModelLoadedMessage =
  { type: 'model'; ok: true; labels: string[] } | { type: 'model'; ok: false; error: string };
/** Solo cuando cambia: hay o no hay manos. */
export type HandsMessage = { type: 'hands'; detected: boolean };

/** Tiempos en ms desde epoch (`performance.timeOrigin + performance.now()`) de un frame. */
export type FrameTiming = {
  receivedAt: number;
  detectStart: number;
  detectEnd: number;
  inferStart: number;
  inferEnd: number;
};

/** Predicción de la GRU sobre la ventana que termina en el frame `frameId`. */
export type PredictionMessage = {
  type: 'prediction';
  frameId: number;
  prediction: ModelPrediction | null;
  /** Solo si se pidió con `diagnostics`: probabilidad de cada etiqueta. */
  probabilities?: Record<string, number>;
  timing: FrameTiming;
};
/** Solo sin SharedArrayBuffer: el worker ya puede recibir otro frame. */
export type FrameDoneMessage = { type: 'frameDone'; frameId: number };
export type WorkerErrorMessage = { type: 'error'; error: string };

export type FromWorkerMessage =
  | LandmarkerMessage
  | ModelLoadedMessage
  | HandsMessage
  | PredictionMessage
  | FrameDoneMessage
  | WorkerErrorMessage;
