import { t } from '@/i18n';

import { Logo } from './Logo';
import styles from './ui.module.css';

/** Marca: logo de la mano y el nombre. `inverted` para fondos ámbar. */
export function Brand({
  inverted = false,
  logoMode = 'once',
}: Readonly<{ inverted?: boolean; logoMode?: 'continuous' | 'once' }>) {
  return (
    <p className={styles.brand}>
      <Logo size={40} mode={logoMode} tone={inverted ? 'onAccent' : 'default'} />
      {t('app.name')}
    </p>
  );
}
