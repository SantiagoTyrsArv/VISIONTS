import { t } from '@/i18n';

import styles from './ui.module.css';

type Props = {
  text: string;
  shortcut?: number;
  active?: boolean;
  /** La frase tiene seña en el modelo: se puede decir haciéndola en Cámara. */
  hasSign?: boolean;
  onClick: () => void;
};

export function PhraseCard({ text, shortcut, active = false, hasSign = false, onClick }: Props) {
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
      {hasSign ? <span className={styles.signBadge}>{t('home.hasSign')}</span> : null}
    </button>
  );
}
