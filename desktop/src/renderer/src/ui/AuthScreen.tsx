import type { ReactNode } from 'react';

import { t } from '@/i18n';

import { Brand } from './Brand';
import styles from './ui.module.css';

export function AuthScreen({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return (
    <div className={styles.auth}>
      <section className={styles.authHero}>
        <Brand inverted logoMode="continuous" />
        <div className={styles.authCopy}>
          <p className={styles.authClaim}>{t('auth.claim')}</p>
          <p className={styles.authSub}>{t('auth.claimSub')}</p>
        </div>
      </section>
      <main className={styles.authMain}>
        <div className={styles.authBox}>
          <h1 className={styles.title}>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
