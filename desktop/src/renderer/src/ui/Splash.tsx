import { t } from '@/i18n';

import styles from './ui.module.css';

export function Splash() {
  return <output className={styles.splash}>{t('app.loading')}</output>;
}
