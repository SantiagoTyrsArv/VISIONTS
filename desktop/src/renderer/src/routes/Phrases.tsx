import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { usePlayback } from '@/store/playback';
import { signLabels, useSignModel } from '@/store/signModel';
import { Button } from '@/ui/Button';
import { IconSpeaker } from '@/ui/icons';
import { NowSaying } from '@/ui/NowSaying';
import { PhraseCard } from '@/ui/PhraseCard';

import styles from './routes.module.css';

const speak = (p: Phrase) => void speechService.speak({ code: p.code, text: p.text_es });

export default function Phrases() {
  const { data, isPending, isError, refetch, isRefetching } = usePhrases();
  const lastText = usePlayback((s) => s.lastText);
  const signs = useSignModel(useShallow(signLabels));
  usePhraseShortcuts(data, speak);

  let content: ReactNode;
  if (isPending) {
    content = <output className={styles.center}>{t('home.loading')}</output>;
  } else if (isError) {
    content = (
      <div className={styles.center}>
        <p className={styles.errorText}>{t('home.error')}</p>
        <Button label={t('home.retry')} loading={isRefetching} onClick={() => void refetch()} />
      </div>
    );
  } else {
    content = (
      <div className={styles.grid}>
        {data.map((p, i) => (
          <PhraseCard
            key={p.code}
            text={p.text_es}
            shortcut={i < 9 ? i + 1 : undefined}
            active={p.text_es === lastText}
            hasSign={signs.includes(p.code)}
            onClick={() => speak(p)}
          />
        ))}
      </div>
    );
  }

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

      <NowSaying />

      {content}
    </div>
  );
}
