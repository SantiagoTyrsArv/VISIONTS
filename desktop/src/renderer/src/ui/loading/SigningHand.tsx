import { useEffect, useState } from 'react';

import { ONDAS } from '@/ui/logoPaths';

import { handPaths, POSES, poseAt } from './handPose';
import styles from './loading.module.css';

const PALMA = 'M21 56 V88 A16 16 0 0 0 37 104 H63 A16 16 0 0 0 79 88 V64 Q79 56 69 56 Z';
/** Intervalo mínimo entre repintados, para no renderizar en cada frame. */
const PASO_MS = 30;

/**
 * Mano decorativa que cambia entre posturas de señas. Con `animate={false}`
 * queda quieta en «Abierta» y no usa requestAnimationFrame.
 */
export function SigningHand({ animate }: Readonly<{ animate: boolean }>) {
  const [tiempo, setTiempo] = useState(0);

  useEffect(() => {
    if (!animate) return;
    const inicio = performance.now();
    let ultimo = -PASO_MS;
    let id = 0;
    const frame = (ahora: number) => {
      const t = ahora - inicio;
      if (t - ultimo >= PASO_MS) {
        ultimo = t;
        setTiempo(t);
      }
      id = window.requestAnimationFrame(frame);
    };
    id = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(id);
  }, [animate]);

  const { fingers, thumb } = handPaths(animate ? poseAt(tiempo) : POSES[0]);

  return (
    <svg
      className={styles.hand}
      viewBox="0 0 120 120"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform="translate(0 6)">
        <g className={styles.sway}>
          <g className={styles.outer} strokeWidth={17}>
            {fingers.map((d, i) => (
              <path key={i} d={d} data-part="finger" />
            ))}
          </g>
          <path d={PALMA} className={styles.outer} strokeWidth={8} fill="var(--text)" />
          <path d={PALMA} className={styles.inner} fill="var(--bg)" />
          <g className={styles.inner} strokeWidth={9}>
            {fingers.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
          <path d={thumb} className={styles.outer} strokeWidth={17} />
          <path d={thumb} className={styles.inner} strokeWidth={9} />
        </g>
      </g>
      <g transform="translate(12 6)" strokeWidth={5.5}>
        {ONDAS.map((d, i) => (
          <path
            key={d}
            d={d}
            className={styles.wave}
            data-part="wave"
            style={{ animationDelay: `${i * 0.25}s` }}
          />
        ))}
      </g>
    </svg>
  );
}
