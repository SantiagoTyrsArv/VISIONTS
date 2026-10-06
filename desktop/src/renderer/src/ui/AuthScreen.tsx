import type { ReactNode } from 'react';

import { t } from '@/i18n';

import styles from './ui.module.css';

export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.auth}>
      <div className={styles.authBox}>
        <p className={styles.brand}>{t('app.name')}</p>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
    </main>
  );
}
