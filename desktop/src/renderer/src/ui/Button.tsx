import styles from './ui.module.css';

type Props = {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  ariaLabel?: string;
};

export function Button({
  label,
  onClick,
  type = 'button',
  loading,
  disabled,
  variant = 'primary',
  ariaLabel,
}: Props) {
  const cls = [styles.button, variant !== 'primary' && styles[variant]].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={cls}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-label={ariaLabel}
    >
      {label}
    </button>
  );
}
