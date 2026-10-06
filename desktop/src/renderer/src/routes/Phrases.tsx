import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { Button } from '@/ui/Button';
import { PhraseCard } from '@/ui/PhraseCard';

import styles from './routes.module.css';

const speak = (p: Phrase) => void speechService.speak({ code: p.code, text: p.text_es });

export default function Phrases() {
  const { data, isPending, isError, refetch, isRefetching } = usePhrases();
  usePhraseShortcuts(data, speak);

  return (
    <>
      <h1 className={styles.title}>{t('home.title')}</h1>
      <p className={styles.hint}>{t('home.hint')}</p>
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
              onClick={() => speak(p)}
            />
          ))}
        </div>
      )}
    </>
  );
}
