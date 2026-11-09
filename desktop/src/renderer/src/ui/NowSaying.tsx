import { motion, useReducedMotion } from 'motion/react';

import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { usePlayback } from '@/store/playback';

import styles from './ui.module.css';

/**
 * Banda ámbar con lo que suena (o lo último que se dijo), venga de una seña, un clic o un
 * atajo. `overlay` la coloca sobre la parte baja del vídeo de la cámara.
 */
export function NowSaying({ overlay = false }: Readonly<{ overlay?: boolean }>) {
  const lastText = usePlayback((s) => s.lastText);
  const playing = usePlayback((s) => s.playing);
  const reduced = useReducedMotion();
  if (!lastText) return null;

  return (
    <section
      className={overlay ? `${styles.nowSaying} ${styles.nowSayingOverlay}` : styles.nowSaying}
      aria-live="polite"
    >
      <span className={playing ? styles.barsLive : styles.bars} aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      {/* La clave es el texto: cada frase nueva entra con su propia animación. */}
      <motion.div
        key={lastText}
        className={styles.nowSayingText}
        initial={reduced ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <span className={styles.eyebrow}>{t(playing ? 'home.nowPlaying' : 'home.lastSaid')}</span>
        <span className={styles.nowSayingPhrase}>{lastText}</span>
      </motion.div>
      <button type="button" className={styles.stopBtn} onClick={() => speechService.stop()}>
        {t('home.stop')}
      </button>
    </section>
  );
}
