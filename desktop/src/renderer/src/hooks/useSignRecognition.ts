import { useEffect, useRef, useState, type RefObject } from 'react';

import type { TranslationKey } from '@/i18n';
import {
  cameraErrorKey,
  listCameras,
  openCamera,
  type CameraErrorKey,
} from '@/services/camera/camera';
import { MediaPipeSignRecognizer } from '@/services/recognition/MediaPipeSignRecognizer';
import type { RecognitionStatus } from '@/services/recognition/SignRecognizer';
import { useSettings } from '@/store/settings';

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

  useEffect(() => {
    const videoElement = videoRef.current;
    let stream: MediaStream | null = null;
    let recognizer: MediaPipeSignRecognizer | null = null;
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
            recognizer = new MediaPipeSignRecognizer(videoElement);
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
