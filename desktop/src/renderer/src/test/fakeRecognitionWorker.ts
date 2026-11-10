import type { FromWorkerMessage, ToWorkerMessage } from '../../../shared/recognitionProtocol';
import type { Landmarker } from '@/services/recognition/handLandmarker';
import { createRecognitionWorker } from '@/services/recognition/recognitionWorkerCore';
import type { WorkerPort } from '@/services/recognition/WorkerSignRecognizer';

export type FakeRecognitionWorker = WorkerPort & {
  received: ToWorkerMessage[];
  terminated: boolean;
};

/**
 * Worker en el mismo hilo con el núcleo real (recognitionWorkerCore) y un MediaPipe de prueba.
 * Las respuestas llegan en una task aparte (setTimeout), como el `message` de un Worker real.
 */
export function fakeRecognitionWorker(
  createLandmarker: () => Promise<Landmarker>,
): FakeRecognitionWorker {
  const port: FakeRecognitionWorker = {
    onmessage: null,
    onerror: null,
    received: [],
    terminated: false,
    postMessage(message) {
      port.received.push(message);
      core.handle(message);
    },
    terminate() {
      port.terminated = true;
    },
  };
  const core = createRecognitionWorker({
    post: (message: FromWorkerMessage) =>
      setTimeout(() => port.onmessage?.({ data: message } as MessageEvent<FromWorkerMessage>), 0),
    close: () => undefined,
    now: () => performance.timeOrigin + performance.now(),
    createLandmarker,
  });
  return port;
}
