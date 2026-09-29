import { t } from '@/i18n';

import styles from './ui.module.css';

export function Splash() {
  return (
    <div className={styles.splash} role="status">
      {t('app.loading')}
    </div>
  );
}
