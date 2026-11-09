import styles from './logo.module.css';
import { CONTORNO_MANO, INTERIOR_MANO, ONDAS } from './logoPaths';

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
        <path d={CONTORNO_MANO} />
        <path d={INTERIOR_MANO} />
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
