import { useReducedMotion } from 'motion/react';

const ENTER_S = 0.6;
const STAGGER_S = 0.08;
// Más allá de este índice todos entran juntos, para que las listas largas no tarden.
const MAX_STAGGER = 8;

/**
 * Props de `motion` para la entrada escalonada de paneles (0,6 s, 10 px, 80 ms de desfase).
 * Con movimiento reducido aparecen ya colocados.
 */
export function useEnter() {
  const reduced = useReducedMotion();
  return (i: number) =>
    ({
      initial: reduced ? false : { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: {
        duration: ENTER_S,
        delay: Math.min(i, MAX_STAGGER) * STAGGER_S,
        ease: 'easeOut',
      },
    }) as const;
}
