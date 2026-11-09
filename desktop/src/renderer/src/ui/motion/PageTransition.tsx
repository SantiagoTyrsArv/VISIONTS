import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Cambio de pantalla: entra con un fundido y sube 8 px; sale solo con fundido. */
export function PageTransition({ children }: Readonly<{ children: ReactNode }>) {
  const reduced = useReducedMotion();
  // Con movimiento reducido el cambio es instantáneo (la opacidad también se anima).
  const transition = { duration: reduced ? 0 : 0.25, ease: 'easeOut' } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={transition}
    >
      {children}
    </motion.div>
  );
}
