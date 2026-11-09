import { motion, usePresenceData, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

/** Cada tramo (salida y entrada) dura esto; con `mode="wait"` van seguidos. */
const STEP_S = 0.15;

/**
 * Cambio de pantalla: la saliente se desvanece y la entrante sube 8 px mientras aparece.
 * `instant` (reunión, movimiento reducido) cambia sin animar. `shift={false}` solo funde: entre
 * grupos de rutas el desplazamiento movería toda la ventana y sacaría una barra de scroll. Si el `custom` de AnimatePresence
 * es `true`, el destino es instantáneo (la reunión) y la pantalla saliente tampoco anima.
 */
export function PageTransition({
  children,
  instant = false,
  shift = true,
}: Readonly<{ children: ReactNode; instant?: boolean; shift?: boolean }>) {
  const reduced = useReducedMotion();
  const toInstant = usePresenceData() === true;
  const duration = reduced || instant ? 0 : STEP_S;
  const exitDuration = toInstant ? 0 : duration;
  return (
    <motion.div
      initial={{ opacity: 0, y: instant || !shift ? 0 : 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration, ease: 'easeOut' } }}
      exit={{ opacity: 0, transition: { duration: exitDuration, ease: 'easeOut' } }}
      data-duration={duration}
      data-exit-duration={exitDuration}
      data-shift={shift ? 8 : 0}
    >
      {children}
    </motion.div>
  );
}
