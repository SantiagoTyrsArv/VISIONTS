import { useEffect, useRef, useState, type RefObject } from 'react';

import { t, type TranslationKey } from '@/i18n';
import {
  cameraErrorKey,
  listCameras,
  openCamera,
  type CameraErrorKey,
} from '@/services/camera/camera';
import { MediaPipeSignRecognizer } from '@/services/recognition/MediaPipeSignRecognizer';
import type { LandmarkFrame, RecognitionStatus } from '@/services/recognition/SignRecognizer';
import { useSettings } from '@/store/settings';
import { isTraining, useSignModel } from '@/store/signModel';

export type CamState =
  { kind: 'starting' } | { kind: 'ready' } | { kind: 'error'; key: CameraErrorKey };

/** Mensaje del estado de la visión (detector de manos y modelo de señas). */
export function visionMessageKey(recognition: RecognitionStatus | null): TranslationKey {
  if (recognition?.phase === 'error') return 'camera.visionError';
  if (recognition?.phase === 'initializing' || !recognition) return 'camera.visionStarting';
  if (!recognition.modelAvailable)
    return recognition.handsDetected ? 'camera.handsWithoutModel' : 'camera.modelUnavailable';
  return recognition.handsDetected ? 'camera.handsDetected' : 'camera.searchingHands';
}

type ModelView = {
  status: 'unknown' | 'none' | 'ready' | 'error';
  metrics: { val_accuracy: number } | null;
  job: Parameters<typeof isTraining>[0];
};

/** Texto del estado del modelo de señas para los paneles de Cámara y Reunión. */
export function modelStatusText(model: ModelView): string {
  if (isTraining(model.job)) return t('camera.modelTraining');
  if (model.status === 'ready' && model.metrics) {
    return t('camera.modelReady', { pct: String(Math.round(model.metrics.val_accuracy * 100)) });
  }
  if (model.status === 'error') return t('camera.modelError');
  return t('camera.modelNo');
}

export type SignRecognitionOptions = {
  /** false en la pantalla Entrenar: solo se necesitan los frames. */
  classify?: boolean;
  onFrame?: (frame: LandmarkFrame) => void;
};

/**
 * Webcam + reconocedor de señas sobre un <video>. Lo usan la pantalla Cámara y la de
 * reunión; solo una está montada a la vez, así que hay una sola cámara abierta.
 */
export function useSignRecognition(
  videoRef: RefObject<HTMLVideoElement | null>,
  onSign: (code: string) => void,
  options: SignRecognitionOptions = {},
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

  const classify = options.classify ?? true;
  const modelClassifier = useSignModel((s) => s.classifier);
  const classifier = classify ? modelClassifier : null;
  const classifierRef = useRef(classifier);
  const onFrameRef = useRef(options.onFrame);
  useEffect(() => {
    onFrameRef.current = options.onFrame;
  });
  const recognizerRef = useRef<MediaPipeSignRecognizer | null>(null);

  // Un modelo nuevo (p. ej. tras entrenar) se aplica sin reiniciar la cámara.
  useEffect(() => {
    classifierRef.current = classifier;
    recognizerRef.current?.setClassifier(classifier);
  }, [classifier]);

  useEffect(() => {
    const videoElement = videoRef.current;
    let stream: MediaStream | null = null;
    let recognizer: MediaPipeSignRecognizer | null = null;
    let unsubscribeSign: (() => void) | null = null;
    let unsubscribeStatus: (() => void) | null = null;
    let unsubscribeFrame: (() => void) | null = null;
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
            recognizer = new MediaPipeSignRecognizer(videoElement, {
              classifier: classifierRef.current,
            });
            recognizerRef.current = recognizer;
            unsubscribeSign = recognizer.onSign(({ code }) => onSignRef.current(code));
            unsubscribeStatus = recognizer.onStatus((status) => setRecognition(status));
            unsubscribeFrame = recognizer.onFrame((frame) => onFrameRef.current?.(frame));
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
      unsubscribeFrame?.();
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
