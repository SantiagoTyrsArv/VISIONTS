import { useEffect, useMemo, useRef, useState } from 'react';

import { usePhrases } from '@/api/usePhrases';
import { t } from '@/i18n';
import {
  cameraErrorKey,
  listCameras,
  openCamera,
  type CameraErrorKey,
} from '@/services/camera/camera';
import { MockSignRecognizer } from '@/services/recognition/MockSignRecognizer';
import type { SignRecognizer } from '@/services/recognition/SignRecognizer';
import { speechService } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

type CamState = { kind: 'starting' } | { kind: 'ready' } | { kind: 'error'; key: CameraErrorKey };

export default function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraId = useSettings((s) => s.cameraId);
  const setCameraId = useSettings((s) => s.setCameraId);
  const { data: phrases } = usePhrases();
  const [cam, setCam] = useState<CamState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [lastSign, setLastSign] = useState<string | null>(null);
  const [debugIndex, setDebugIndex] = useState(0);

  // Fase 3: sustituir por el reconocedor real. El resto de la pantalla solo
  // conoce la interfaz SignRecognizer.
  const recognizer = useMemo(() => new MockSignRecognizer(), []);
  const recognizerApi: SignRecognizer = recognizer;

  // Catálogo accesible desde el callback sin re-suscribirse en cada render.
  const phrasesRef = useRef(phrases);
  useEffect(() => {
    phrasesRef.current = phrases;
  });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    openCamera(cameraId)
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          try {
            await video.play?.();
          } catch {
            // jsdom / autoplay: el vídeo arranca igualmente con autoPlay.
          }
        }
        setCam({ kind: 'ready' });
        // Con el permiso concedido, las etiquetas de los dispositivos ya son legibles.
        setCameras(await listCameras());
      })
      .catch((e: unknown) => {
        if (!cancelled) setCam({ kind: 'error', key: cameraErrorKey(e) });
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [cameraId, attempt]);

  useEffect(() => {
    const off = recognizerApi.onSign(({ code }) => {
      const phrase = phrasesRef.current?.find((p) => p.code === code);
      if (!phrase) return;
      setLastSign(phrase.text_es);
      void speechService.speak({ code: phrase.code, text: phrase.text_es });
    });
    void recognizerApi.start();
    return () => {
      off();
      recognizerApi.stop();
    };
  }, [recognizerApi]);

  const retry = () => {
    setCam({ kind: 'starting' });
    setAttempt((a) => a + 1);
  };
  const next = phrases && phrases.length > 0 ? phrases[debugIndex % phrases.length] : undefined;

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
            t('camera.comingSoon')
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
          {next ? (
            <div className={styles.debug}>
              <p className={styles.debugTitle}>{t('camera.debugTitle')}</p>
              <Button
                variant="secondary"
                label={t('camera.debugSimulate', { text: next.text_es })}
                onClick={() => {
                  recognizer.simulate(next.code);
                  setDebugIndex((i) => i + 1);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
