import styles from './logo.module.css';
import { ONDAS } from './logoPaths';

const CONTORNO =
  'M22 86 V30 A6 6 0 0 1 34 30 V16 A6 6 0 0 1 46 16 V10 A6 6 0 0 1 58 10 V22 A6 6 0 0 1 70 22 V54 Q70 58 76 58 Q80 58 80 64 V86 A18 18 0 0 1 62 104 H40 A18 18 0 0 1 22 86 Z';
const INTERIOR = 'M34 30 V52 M46 16 V52 M58 22 V52 M76 58 H50 A6 6 0 0 0 50 70 L64 74';

/**
 * Logo de la mano que habla. `continuous` anima sin parar (acceso y carga);
 * `once` hace un solo saludo y queda quieto. `onAccent` es para fondos ámbar.
 */
export function Logo({
  size = 40,
  mode = 'once',
  tone = 'default',
}: Readonly<{ size?: number; mode?: 'continuous' | 'once'; tone?: 'default' | 'onAccent' }>) {
  // A tamaños pequeños el trazo se engrosa para que no se pierda.
  const grosor = size >= 64 ? 5.5 : 7;
  const clase = [
    styles.logo,
    mode === 'once' ? styles.once : '',
    tone === 'onAccent' ? styles.onAccent : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      className={clase}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-mode={mode}
    >
      <g className={styles.hand}>
        <path d={CONTORNO} />
        <path d={INTERIOR} />
      </g>
      {ONDAS.map((d, i) => (
        <path
          key={d}
          d={d}
          className={styles.wave}
          data-part="wave"
          style={{ animationDelay: `${i * 0.25}s` }}
        />
      ))}
    </svg>
  );
}
