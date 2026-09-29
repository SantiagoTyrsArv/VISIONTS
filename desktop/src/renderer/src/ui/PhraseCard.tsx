import { t } from '@/i18n';

import styles from './ui.module.css';

type Props = { text: string; shortcut?: number; onClick: () => void };

export function PhraseCard({ text, shortcut, onClick }: Props) {
  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      aria-label={t('home.speakA11y', { text })}
      aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
    >
      {shortcut ? (
        <span className={styles.shortcut} aria-hidden>
          {shortcut}
        </span>
      ) : null}
      {text}
    </button>
  );
}
