import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { modelStatusText, useSignRecognition, visionMessageKey } from '@/hooks/useSignRecognition';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { useSignDiagnostics } from '@/store/signDiagnostics';
import { useSignModel } from '@/store/signModel';
import { Button } from '@/ui/Button';
import { NowSaying } from '@/ui/NowSaying';
import { SignDiagnostics } from '@/ui/SignDiagnostics';

import styles from './routes.module.css';

const RECENT = 5;
const QUICK = 9;
/** Entrada de paneles: aparición y 10 px hacia arriba, 0,6 s, 80 ms entre uno y otro. */
const PANEL_S = 0.6;
const STAGGER_S = 0.08;

type Said = { id: number; text: string };

function Status({ ok, label }: Readonly<{ ok: boolean; label: string }>) {
  return (
    <span className={ok ? styles.statusValue : `${styles.statusValue} ${styles.statusWarn}`}>
      <span className={ok ? `${styles.dotLive} ${styles.dotPulse}` : styles.dotWarn} aria-hidden />
      {label}
    </span>
  );
}

export default function Camera(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = useReducedMotion();
  const { data: phrases } = usePhrases();
  const [recent, setRecent] = useState<Said[]>([]);
  const nextId = useRef(0);

  // Todo lo que se dice desde aquí (seña, botón o tecla) pasa por `say`.
  const say = useCallback((p: Phrase) => {
    const said = { id: nextId.current++, text: p.text_es };
    setRecent((r) => [said, ...r].slice(0, RECENT));
    void speechService.speak({ code: p.code, text: p.text_es });
  }, []);

  const { cam, cameras, recognition, cameraId, retry, selectCamera } = useSignRecognition(
    videoRef,
    (code) => {
      const phrase = phrases?.find((p) => p.code === code);
      if (phrase) say(phrase);
    },
  );
  usePhraseShortcuts(phrases, say);

  const ready = cam.kind === 'ready';
  const hands = recognition?.handsDetected ?? false;
  const model = useSignModel(useShallow((s) => ({ status: s.status, labels: s.labels })));
  const modelReady = model.status === 'ready';
  const phraseNames = useMemo(
    () => Object.fromEntries((phrases ?? []).map((p) => [p.code, p.text_es])),
    [phrases],
  );
  // Sin manos el reconocedor deja de predecir: la última lectura ya no vale.
  useEffect(() => {
    if (!hands) useSignDiagnostics.getState().clear();
  }, [hands]);

  // Con movimiento reducido los paneles aparecen ya colocados.
  const panel = (i: number) =>
    ({
      initial: reduced ? false : { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: PANEL_S, delay: i * STAGGER_S, ease: 'easeOut' },
    }) as const;

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
        <motion.div className={styles.stage} {...panel(0)}>
          <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
          {cam.kind === 'error' ? (
            <div role="alert" className={styles.cameraError}>
              <p>{t(cam.key)}</p>
              <Button label={t('camera.retry')} onClick={retry} />
            </div>
          ) : (
            <output className={styles.chip}>
              <span
                className={hands ? `${styles.dotLive} ${styles.dotPulse}` : styles.dotWarn}
                aria-hidden
              />
              {cam.kind === 'starting' ? t('camera.starting') : t(visionMessageKey(recognition))}
            </output>
          )}
          <NowSaying overlay />
        </motion.div>

        <aside className={styles.aside}>
          <motion.section className={styles.panel} {...panel(1)}>
            <h2 className={styles.panelTitle} id="recent-title">
              {t('camera.recentTitle')}
            </h2>
            {recent.length ? (
              <ul className={styles.recentList} aria-labelledby="recent-title">
                {recent.map((s) => (
                  <motion.li
                    key={s.id}
                    initial={reduced ? false : { opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    {s.text}
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className={styles.muted}>{t('camera.recentEmpty')}</p>
            )}
          </motion.section>

          <motion.section className={styles.panel} {...panel(2)}>
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
              <Status ok={modelReady} label={modelStatusText(model)} />
            </p>
          </motion.section>

          {import.meta.env.DEV ? <SignDiagnostics names={phraseNames} /> : null}
        </aside>
      </div>

      {phrases?.length ? (
        <motion.section className={styles.quick} aria-labelledby="quick-title" {...panel(3)}>
          <h2 className={styles.panelTitle} id="quick-title">
            {t('camera.quickTitle')}{' '}
            <span className={styles.quickHint}>{t('camera.quickHint')}</span>
          </h2>
          <div className={styles.quickRow}>
            {phrases.slice(0, QUICK).map((p, i) => (
              <button
                key={p.code}
                type="button"
                className={styles.quickBtn}
                onClick={() => say(p)}
                aria-label={t('home.speakA11y', { text: p.text_es })}
                aria-keyshortcuts={String(i + 1)}
              >
                <span className={styles.quickKey} aria-hidden>
                  {i + 1}
                </span>
                {p.text_es}
              </button>
            ))}
          </div>
        </motion.section>
      ) : null}
    </div>
  );
}
