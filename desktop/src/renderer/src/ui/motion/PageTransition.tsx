import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Cada tramo (salida y entrada) dura esto; con `mode="wait"` van seguidos. */
const STEP_S = 0.15;

/**
 * Cambio de pantalla: la saliente se desvanece y la entrante sube 8 px mientras aparece.
 * `instant` (reunión, movimiento reducido) cambia sin animar.
 */
export function PageTransition({
  children,
  instant = false,
}: Readonly<{ children: ReactNode; instant?: boolean }>) {
  const reduced = useReducedMotion();
  const duration = reduced || instant ? 0 : STEP_S;
  const transition = { duration, ease: 'easeOut' } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: instant ? 0 : 8 }}
      animate={{ opacity: 1, y: 0, transition }}
      exit={{ opacity: 0, transition }}
      data-duration={duration}
    >
      {children}
    </motion.div>
  );
}
