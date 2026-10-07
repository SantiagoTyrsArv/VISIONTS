import { useRef, useState } from 'react';
import type { JSX } from 'react';

import { usePhrases } from '@/api/usePhrases';
import { useSignRecognition, visionMessageKey } from '@/hooks/useSignRecognition';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

export default function Camera(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data: phrases } = usePhrases();
  const [lastSign, setLastSign] = useState<string | null>(null);
  const { cam, cameras, recognition, cameraId, retry, selectCamera } = useSignRecognition(
    videoRef,
    (code) => {
      const phrase = phrases?.find((p) => p.code === code);
      if (!phrase) return;
      setLastSign(phrase.text_es);
      void speechService.speak({ code: phrase.code, text: phrase.text_es });
    },
  );
  const visionMessage = t(visionMessageKey(recognition));

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
                onChange={(e) => selectCamera(e.target.value || null)}
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
