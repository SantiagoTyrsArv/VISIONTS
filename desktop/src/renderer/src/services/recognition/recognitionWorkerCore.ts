import {
  CTRL_BUSY,
  type FrameMessage,
  type FromWorkerMessage,
  type ModelPrediction,
  type ToWorkerMessage,
} from '../../../../shared/recognitionProtocol';
import type { ClassProbabilities } from './diagnostics';
import { GruModel } from './GruModel';
import { toDetectedHands, type Landmarker } from './handLandmarker';
import { FRAME_INTERVAL_MS, LandmarkSequenceBuffer } from './landmarks';
import { LocalWindowModel } from './windowModels';

/** Lo que el núcleo necesita del entorno del worker; en los tests, dobles. */
export type WorkerHost = {
  post(message: FromWorkerMessage): void;
  close(): void;
  /** ms desde epoch (`performance.timeOrigin + performance.now()`). */
  now(): number;
  createLandmarker(): Promise<Landmarker>;
};

/**
 * Reconocimiento completo fuera del hilo principal: MediaPipe sobre cada frame recibido y la
 * GRU sobre la ventana de 30 frames muestreados. Solo responde cuando hay algo nuevo (cambio
 * de manos o predicción), salvo sin memoria compartida, donde confirma cada frame.
 */
export function createRecognitionWorker(host: WorkerHost): {
  handle(message: ToWorkerMessage): void;
} {
  let control: Int32Array | null = null;
  let landmarker: Landmarker | null = null;
  let model: LocalWindowModel | null = null;
  let probabilities: ClassProbabilities | null = null;
  const sequence = new LandmarkSequenceBuffer();
  let lastSampleAt = -Infinity;
  let previousTimestamp = -1;
  let handsDetected = false;
  let stopped = false;

  /** El worker queda libre para el siguiente frame. */
  function release(frameId: number): void {
    if (control) Atomics.store(control, CTRL_BUSY, 0);
    else host.post({ type: 'frameDone', frameId });
  }

  function processFrame(message: FrameMessage): void {
    const receivedAt = host.now();
    if (!landmarker) return;
    // MediaPipe exige timestamps estrictamente crecientes.
    const timestamp = Math.max(Math.floor(message.timestamp), previousTimestamp + 1);
    previousTimestamp = timestamp;

    const detectStart = host.now();
    const hands = toDetectedHands(landmarker.detectForVideo(message.bitmap, timestamp));
    const detectEnd = host.now();
    const detected = hands.length > 0;
    if (detected !== handsDetected) {
      handsDetected = detected;
      host.post({ type: 'hands', detected });
    }

    // La ventana se llena a ritmo fijo, no al de la cámara (ver FRAME_INTERVAL_MS).
    if (timestamp - lastSampleAt < FRAME_INTERVAL_MS) return;
    lastSampleAt = timestamp;
    const frame = sequence.add(hands);
    model?.push(frame);
    if (!model || !sequence.isReady || !sequence.hasHands()) return;

    const inferStart = host.now();
    probabilities = null;
    const prediction: ModelPrediction | null = model.predict();
    host.post({
      type: 'prediction',
      frameId: message.id,
      prediction,
      ...(probabilities ? { probabilities } : {}),
      timing: { receivedAt, detectStart, detectEnd, inferStart, inferEnd: host.now() },
    });
  }

  function setModel(weights: unknown, diagnostics: boolean): void {
    if (weights === null) {
      model = null;
      return;
    }
    try {
      const gru = GruModel.fromJson(weights);
      model = new LocalWindowModel(
        gru,
        diagnostics ? (p: ClassProbabilities) => (probabilities = p) : undefined,
      );
      // Los frames ya reunidos pasan a la ventana del nuevo modelo.
      sequence.frames().forEach((f) => model!.push(f));
      host.post({ type: 'model', ok: true, labels: [...gru.labels] });
    } catch (e) {
      model = null;
      host.post({ type: 'model', ok: false, error: String(e) });
    }
  }

  return {
    handle(message) {
      if (stopped) {
        if (message.type === 'frame') message.bitmap.close();
        return;
      }
      switch (message.type) {
        case 'init':
          control = message.control ? new Int32Array(message.control) : null;
          host
            .createLandmarker()
            .then((created) => {
              if (stopped) {
                created.close();
                return;
              }
              landmarker = created;
              host.post({ type: 'landmarker', ok: true });
            })
            .catch((e: unknown) => host.post({ type: 'landmarker', ok: false, error: String(e) }));
          return;
        case 'setModel':
          setModel(message.weights, message.diagnostics);
          return;
        case 'frame':
          try {
            processFrame(message);
          } catch (e) {
            host.post({ type: 'error', error: String(e) });
          } finally {
            // El bitmap se transfirió: este hilo lo libera en cuanto MediaPipe lo ha leído.
            message.bitmap.close();
            release(message.id);
          }
          return;
        case 'stop':
          stopped = true;
          landmarker?.close();
          landmarker = null;
          host.close();
          return;
      }
    },
  };
}
