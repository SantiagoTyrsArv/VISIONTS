import { useEffect, useRef, useState, type RefObject } from 'react';

import { t, type TranslationKey } from '@/i18n';
import {
  cameraErrorKey,
  listCameras,
  openCamera,
  type CameraErrorKey,
} from '@/services/camera/camera';
import { MediaPipeSignRecognizer } from '@/services/recognition/MediaPipeSignRecognizer';
import { getRecognitionThread } from '@/services/recognition/recognitionThread';
import { WorkerSignRecognizer } from '@/services/recognition/WorkerSignRecognizer';
import type { RecognitionStatus } from '@/services/recognition/SignRecognizer';
import { useSettings } from '@/store/settings';
import { useSignDiagnostics } from '@/store/signDiagnostics';
import { signLabels, useSignModel } from '@/store/signModel';

export type CamState =
  { kind: 'starting' } | { kind: 'ready' } | { kind: 'error'; key: CameraErrorKey };

/** Mensaje del estado de la visión (detector de manos y modelo de señas). */
export function visionMessageKey(recognition: RecognitionStatus | null): TranslationKey {
  if (recognition?.phase === 'error') return 'camera.visionError';
  if (recognition?.phase === 'initializing' || !recognition) return 'camera.visionStarting';
  if (!recognition.modelAvailable) return 'camera.modelError';
  return recognition.handsDetected ? 'camera.handsDetected' : 'camera.searchingHands';
}

type ModelView = { status: 'loading' | 'ready' | 'error'; labels: string[] };

/** Texto del estado del modelo de señas para los paneles de Cámara y Reunión. */
export function modelStatusText(model: ModelView): string {
  if (model.status === 'ready')
    return t('camera.modelReady', { n: String(signLabels(model).length) });
  if (model.status === 'error') return t('camera.modelError');
  return t('camera.modelLoading');
}

/**
 * MediaPipe y la GRU van en un worker; en desarrollo, el panel Diagnóstico puede volver al
 * hilo principal para comparar el INP. Sin Worker (jsdom) también se usa el hilo principal.
 */
function createRecognizer(
  video: HTMLVideoElement,
  model: {
    classifier: ReturnType<typeof useSignModel.getState>['classifier'];
    workerModel: ReturnType<typeof useSignModel.getState>['workerModel'];
  },
): MediaPipeSignRecognizer | WorkerSignRecognizer {
  const diagnostics = useSignDiagnostics.getState();
  if (typeof Worker === 'function' && getRecognitionThread() === 'worker') {
    const recognizer = new WorkerSignRecognizer(video, {
      model: model.workerModel,
      ...(import.meta.env.DEV ? { onProbabilities: diagnostics.update } : {}),
    });
    diagnostics.setExecution(
      recognizer.backpressure === 'shared' ? 'worker-shared' : 'worker-message',
    );
    return recognizer;
  }
  diagnostics.setExecution('main');
  return new MediaPipeSignRecognizer(video, { classifier: model.classifier });
}

/**
 * Webcam + reconocedor de señas sobre un <video>. Lo usan la pantalla Cámara y la de
 * reunión; solo una está montada a la vez, así que hay una sola cámara abierta.
 */
export function useSignRecognition(
  videoRef: RefObject<HTMLVideoElement | null>,
  onSign: (code: string) => void,
) {
  const cameraId = useSettings((s) => s.cameraId);
  const setCameraId = useSettings((s) => s.setCameraId);
  const [cam, setCam] = useState<CamState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [recognition, setRecognition] = useState<RecognitionStatus | null>(null);

  // Callback accesible sin re-suscribirse en cada render.
  const onSignRef = useRef(onSign);
  useEffect(() => {
    onSignRef.current = onSign;
  });

  const classifier = useSignModel((s) => s.classifier);
  const workerModel = useSignModel((s) => s.workerModel);
  const modelRef = useRef({ classifier, workerModel });
  const recognizerRef = useRef<MediaPipeSignRecognizer | WorkerSignRecognizer | null>(null);

  // El modelo termina de cargar después de abrir la cámara: se aplica sin reiniciarla.
  useEffect(() => {
    modelRef.current = { classifier, workerModel };
    const recognizer = recognizerRef.current;
    if (recognizer instanceof WorkerSignRecognizer) recognizer.setModel(workerModel);
    else recognizer?.setClassifier(classifier);
  }, [classifier, workerModel]);

  useEffect(() => {
    const videoElement = videoRef.current;
    let stream: MediaStream | null = null;
    let recognizer: MediaPipeSignRecognizer | WorkerSignRecognizer | null = null;
    let unsubscribeSign: (() => void) | null = null;
    let unsubscribeStatus: (() => void) | null = null;
    let cancelled = false;
    openCamera(cameraId)
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        if (videoElement) {
          videoElement.srcObject = s;
          try {
            await videoElement.play?.();
          } catch {
            // jsdom / autoplay: el vídeo arranca igualmente con autoPlay.
          }
          if (!cancelled) {
            recognizer = createRecognizer(videoElement, modelRef.current);
            recognizerRef.current = recognizer;
            unsubscribeSign = recognizer.onSign(({ code }) => onSignRef.current(code));
            unsubscribeStatus = recognizer.onStatus((status) => setRecognition(status));
            void recognizer.start();
          }
        }
        setCam({ kind: 'ready' });
        // Con el permiso concedido, las etiquetas de los dispositivos ya son legibles.
        const devices = await listCameras();
        if (!cancelled) setCameras(devices);
      })
      .catch((e: unknown) => {
        if (!cancelled) setCam({ kind: 'error', key: cameraErrorKey(e) });
      });
    return () => {
      cancelled = true;
      unsubscribeSign?.();
      unsubscribeStatus?.();
      recognizerRef.current = null;
      recognizer?.stop();
      if (videoElement?.srcObject === stream) videoElement.srcObject = null;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [cameraId, attempt, videoRef]);

  const restart = () => {
    setCam({ kind: 'starting' });
    setRecognition(null);
  };
  return {
    cam,
    cameras,
    recognition,
    cameraId,
    retry: () => {
      restart();
      setAttempt((a) => a + 1);
    },
    selectCamera: (id: string | null) => {
      restart();
      setCameraId(id);
    },
  };
}
