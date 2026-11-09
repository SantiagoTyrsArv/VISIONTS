import { t } from '@/i18n';
import { Brand } from '@/ui/Brand';

import styles from './loading.module.css';
import { SigningHand } from './SigningHand';
import type { StartupStep } from './startupSteps';

const ETIQUETAS = {
  session: 'loading.session',
  model: 'loading.model',
  phrases: 'loading.phrases',
} as const;

/** Contenido centrado de la pantalla de carga; el overlay lo pone quien la usa. */
export function LoadingScreen({
  steps,
  progress,
  animate,
}: Readonly<{ steps: StartupStep[]; progress: number; animate: boolean }>) {
  return (
    <div className={styles.screen} role="status" aria-live="polite" aria-label={t('loading.title')}>
      <div className={styles.stage}>
        {animate && (
          <>
            <span className={styles.ring} data-part="ring" />
            <span className={styles.ring} data-part="ring" />
            <span className={styles.ring} data-part="ring" />
          </>
        )}
        <SigningHand animate={animate} />
      </div>
      <Brand logoMode="continuous" />
      <p className={styles.claim}>{t('auth.claim')}</p>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <ul className={styles.steps}>
        {steps.map((s) => (
          <li key={s.key} className={styles.step} data-status={s.status}>
            <span className={styles.dot} aria-hidden="true" />
            {t(ETIQUETAS[s.key])}
          </li>
        ))}
      </ul>
      <p className={styles.privacy}>{t('loading.privacy')}</p>
    </div>
  );
}
