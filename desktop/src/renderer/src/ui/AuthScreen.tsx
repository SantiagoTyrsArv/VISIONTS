import type { ReactNode } from 'react';

import { t } from '@/i18n';

import { Brand } from './Brand';
import styles from './ui.module.css';

const BARS = [18, 40, 28, 56, 34, 22, 46, 14];

export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.auth}>
      <section className={styles.authHero}>
        <Brand inverted />
        <div className={styles.authCopy}>
          <p className={styles.authClaim}>{t('auth.claim')}</p>
          <p className={styles.authSub}>{t('auth.claimSub')}</p>
        </div>
        <div className={styles.authBars} aria-hidden="true">
          {BARS.map((h, i) => (
            <span key={i} style={{ height: h }} />
          ))}
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
