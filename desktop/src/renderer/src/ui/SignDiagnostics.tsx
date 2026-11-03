import type { JSX } from 'react';

import { t } from '@/i18n';
import { DEFAULT_THRESHOLD } from '@/services/recognition/SignClassifier';
import { useSignDiagnostics } from '@/store/signDiagnostics';

import styles from './ui.module.css';

const NEUTRAL = 'neutral';
const percent = (p: number): string => `${Math.round(p * 100)} %`;

/**
 * Panel de diagnóstico (solo desarrollo): probabilidad de cada clase en la última lectura
 * del modelo, para saber por qué una seña real no se reconoce.
 */
export function SignDiagnostics({
  names,
}: Readonly<{ names: Readonly<Record<string, string>> }>): JSX.Element {
  const probabilities = useSignDiagnostics((s) => s.probabilities);
  const rows = Object.entries(probabilities ?? {}).sort((a, b) => b[1] - a[1]);
  const [top] = rows;
  const label = (code: string): string =>
    code === NEUTRAL ? t('diagnostics.neutral') : (names[code] ?? code);

  let verdict: string | null = null;
  if (top) {
    if (top[0] === NEUTRAL) verdict = t('diagnostics.verdictNeutral');
    else if (top[1] >= DEFAULT_THRESHOLD) verdict = t('diagnostics.verdictAbove');
    else verdict = t('diagnostics.verdictBelow', { threshold: percent(DEFAULT_THRESHOLD) });
  }

  return (
    <section className={styles.diagnostics} aria-labelledby="diagnostics-title">
      <h2 className={styles.diagnosticsTitle} id="diagnostics-title">
        {t('diagnostics.title')}
      </h2>
      {rows.length ? (
        <>
          <ul className={styles.diagnosticsList}>
            {rows.map(([code, p]) => (
              <li key={code}>
                <span className={styles.diagnosticsRow}>
                  <span>{label(code)}</span>
                  <span>{percent(p)}</span>
                </span>
                <span className={styles.diagnosticsTrack} aria-hidden>
                  <span className={styles.diagnosticsBar} style={{ width: `${p * 100}%` }} />
                  <span
                    className={styles.diagnosticsThreshold}
                    style={{ left: `${DEFAULT_THRESHOLD * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.diagnosticsHint}>{verdict}</p>
        </>
      ) : (
        <p className={styles.diagnosticsHint}>{t('diagnostics.idle')}</p>
      )}
    </section>
  );
}
