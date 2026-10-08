import { t } from '@/i18n';

import styles from './ui.module.css';

type Props = { text: string; shortcut?: number; active?: boolean; onClick: () => void };

export function PhraseCard({ text, shortcut, active = false, onClick }: Props) {
  return (
    <button
      type="button"
      className={active ? `${styles.card} ${styles.cardActive}` : styles.card}
      onClick={onClick}
      aria-label={t('home.speakA11y', { text })}
      aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
    >
      {shortcut ? (
        <span className={styles.shortcut} aria-hidden>
          {shortcut}
        </span>
      ) : (
        <span aria-hidden />
      )}
      <span className={styles.cardText}>{text}</span>
    </button>
  );
}
