import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { usePlayback } from '@/store/playback';
import { Button } from '@/ui/Button';
import { IconSpeaker } from '@/ui/icons';
import { PhraseCard } from '@/ui/PhraseCard';

import styles from './routes.module.css';

const speak = (p: Phrase) => void speechService.speak({ code: p.code, text: p.text_es });

export default function Phrases() {
  const { data, isPending, isError, refetch, isRefetching } = usePhrases();
  const lastText = usePlayback((s) => s.lastText);
  const playing = usePlayback((s) => s.playing);
  usePhraseShortcuts(data, speak);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{t('home.title')}</h1>
          <p className={styles.hint}>{t('home.hint')}</p>
        </div>
        <p className={styles.pill}>
          <IconSpeaker size={16} />
          {t('home.output')} <strong>{t('home.outputSpeakers')}</strong>
        </p>
      </header>

      {lastText ? (
        <section className={styles.nowPlaying} aria-live="polite">
          <span className={playing ? styles.barsLive : styles.bars} aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <div className={styles.nowPlayingText}>
            <span className={styles.eyebrow}>
              {t(playing ? 'home.nowPlaying' : 'home.lastSaid')}
            </span>
            <span className={styles.nowPlayingPhrase}>{lastText}</span>
          </div>
          <button type="button" className={styles.stopBtn} onClick={() => speechService.stop()}>
            {t('home.stop')}
          </button>
        </section>
      ) : null}

      {isPending ? (
        <div className={styles.center} role="status">
          {t('home.loading')}
        </div>
      ) : isError ? (
        <div className={styles.center}>
          <p className={styles.errorText}>{t('home.error')}</p>
          <Button label={t('home.retry')} loading={isRefetching} onClick={() => void refetch()} />
        </div>
      ) : (
        <div className={styles.grid}>
          {data.map((p, i) => (
            <PhraseCard
              key={p.code}
              text={p.text_es}
              shortcut={i < 9 ? i + 1 : undefined}
              active={p.text_es === lastText}
              onClick={() => speak(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
