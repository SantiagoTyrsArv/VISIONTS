import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { usePhrases } from '@/api/usePhrases';
import { t } from '@/i18n';
import {
  cameraErrorKey,
  listCameras,
  openCamera,
  type CameraErrorKey,
} from '@/services/camera/camera';
import { MediaPipeSignRecognizer } from '@/services/recognition/MediaPipeSignRecognizer';
import type { RecognitionStatus } from '@/services/recognition/SignRecognizer';
import { speechService } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

type CamState = { kind: 'starting' } | { kind: 'ready' } | { kind: 'error'; key: CameraErrorKey };

export default function Camera(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraId = useSettings((s) => s.cameraId);
  const setCameraId = useSettings((s) => s.setCameraId);
  const { data: phrases } = usePhrases();
  const [cam, setCam] = useState<CamState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [lastSign, setLastSign] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<RecognitionStatus | null>(null);

  // Catálogo accesible desde el callback sin re-suscribirse en cada render.
  const phrasesRef = useRef(phrases);
  useEffect(() => {
    phrasesRef.current = phrases;
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
        const video = videoElement;
        if (video) {
          video.srcObject = s;
          try {
            await video.play?.();
          } catch {
            // jsdom / autoplay: el vídeo arranca igualmente con autoPlay.
          }
          if (!cancelled) {
            recognizer = new MediaPipeSignRecognizer(video);
            unsubscribeSign = recognizer.onSign(({ code }) => {
              const phrase = phrasesRef.current?.find((p) => p.code === code);
              if (!phrase) return;
              setLastSign(phrase.text_es);
              void speechService.speak({ code: phrase.code, text: phrase.text_es });
            });
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
  }, [cameraId, attempt]);

  const retry = (): void => {
    setCam({ kind: 'starting' });
    setRecognition(null);
    setAttempt((a) => a + 1);
  };
  const visionMessage =
    recognition?.phase === 'error'
      ? t('camera.visionError')
      : recognition?.phase === 'initializing'
        ? t('camera.visionStarting')
        : !recognition?.modelAvailable
          ? t(recognition?.handsDetected ? 'camera.handsWithoutModel' : 'camera.modelUnavailable')
          : t(recognition?.handsDetected ? 'camera.handsDetected' : 'camera.searchingHands');

  return (
    <div className={styles.cameraWrap}>
      <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
      <div className={styles.overlay}>
        <div className={styles.banner}>
          {cam.kind === 'error' ? (
            <div role="alert" className={styles.cameraError}>
              <p>{t(cam.key)}</p>
              <Button label={t('camera.retry')} onClick={retry} />
            </div>
          ) : cam.kind === 'starting' ? (
            <span role="status">{t('camera.starting')}</span>
          ) : (
            <span role="status">{visionMessage}</span>
          )}
        </div>

        <div className={styles.bottom}>
          {lastSign ? (
            <p className={styles.detected}>{t('camera.signDetected', { text: lastSign })}</p>
          ) : null}
          {cameras.length > 1 ? (
            <label className={styles.debug}>
              <span className={styles.debugTitle}>{t('camera.select')}</span>
              <select
                className={styles.select}
                value={cameraId ?? ''}
                onChange={(e) => {
                  setCam({ kind: 'starting' });
                  setRecognition(null);
                  setCameraId(e.target.value || null);
                }}
              >
                <option value="">{t('settings.cameraDefault')}</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}
