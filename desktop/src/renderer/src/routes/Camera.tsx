import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { Link } from 'react-router';

import { usePhrases } from '@/api/usePhrases';
import { useSignRecognition, visionMessageKey } from '@/hooks/useSignRecognition';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

const RECENT = 5;

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={ok ? styles.statusValue : `${styles.statusValue} ${styles.statusWarn}`}>
      <span className={ok ? styles.dotLive : styles.dotWarn} aria-hidden />
      {label}
    </span>
  );
}

export default function Camera(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { data: phrases } = usePhrases();
  const [recent, setRecent] = useState<string[]>([]);
  const { cam, cameras, recognition, cameraId, retry, selectCamera } = useSignRecognition(
    videoRef,
    (code) => {
      const phrase = phrases?.find((p) => p.code === code);
      if (!phrase) return;
      setRecent((r) => [phrase.text_es, ...r].slice(0, RECENT));
      void speechService.speak({ code: phrase.code, text: phrase.text_es });
    },
  );
  const ready = cam.kind === 'ready';
  const modelAvailable = recognition?.modelAvailable ?? false;
  const hands = recognition?.handsDetected ?? false;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{t('camera.title')}</h1>
          <p className={styles.hint}>{t('camera.subtitle')}</p>
        </div>
        {cameras.length > 1 ? (
          <label className={styles.field}>
            <span className={styles.muted}>{t('camera.select')}</span>
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
      </header>

      <div className={styles.cameraLayout}>
        <div className={styles.stage}>
          <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
          {cam.kind === 'error' ? (
            <div role="alert" className={styles.cameraError}>
              <p>{t(cam.key)}</p>
              <Button label={t('camera.retry')} onClick={retry} />
            </div>
          ) : (
            <span role="status" className={styles.chip}>
              <span className={hands ? styles.dotLive : styles.dotWarn} aria-hidden />
              {cam.kind === 'starting' ? t('camera.starting') : t(visionMessageKey(recognition))}
            </span>
          )}
          {recent[0] ? (
            <p className={styles.signBanner}>{t('camera.signDetected', { text: recent[0] })}</p>
          ) : null}
        </div>

        <aside className={styles.aside}>
          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>{t('camera.statusTitle')}</h2>
            <p className={styles.statusRow}>
              {t('camera.statusCamera')}
              <Status ok={ready} label={t(ready ? 'camera.on' : 'camera.off')} />
            </p>
            <p className={styles.statusRow}>
              {t('camera.statusHands')}
              <Status ok={hands} label={t(hands ? 'camera.handsYes' : 'camera.handsNo')} />
            </p>
            <p className={styles.statusRow}>
              {t('camera.statusModel')}
              <Status
                ok={modelAvailable}
                label={t(modelAvailable ? 'camera.modelYes' : 'camera.modelNo')}
              />
            </p>
          </section>

          {ready && !modelAvailable ? (
            <section className={styles.warnPanel}>
              <h2>{t('camera.noModelTitle')}</h2>
              <p>{t('camera.noModelBody')}</p>
              <Link to="/frases" className={styles.linkButton}>
                {t('camera.toPhrases')}
              </Link>
            </section>
          ) : null}

          <section className={styles.panel}>
            <h2 className={styles.panelTitle} id="recent-title">
              {t('camera.recentTitle')}
            </h2>
            {recent.length ? (
              <ul className={styles.recentList} aria-labelledby="recent-title">
                {recent.map((text, i) => (
                  <li key={`${text}-${i}`}>{text}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>{t('camera.recentEmpty')}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
