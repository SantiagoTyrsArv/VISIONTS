import { t } from '@/i18n';

import { IconWave } from './icons';
import styles from './ui.module.css';

/** Marca: placa ámbar con la onda de voz y el nombre. `inverted` para fondos ámbar. */
export function Brand({ inverted = false }: { inverted?: boolean }) {
  return (
    <p className={inverted ? `${styles.brand} ${styles.brandInverted}` : styles.brand}>
      <span className={styles.brandMark}>
        <IconWave size={22} />
      </span>
      {t('app.name')}
    </p>
  );
}
