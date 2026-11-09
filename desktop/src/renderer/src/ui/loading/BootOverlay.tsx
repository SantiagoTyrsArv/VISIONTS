import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import { PHRASES_KEY } from '@/api/usePhrases';
import { useBoot } from '@/store/boot';
import { useSession } from '@/store/session';
import { useSignModel } from '@/store/signModel';

import styles from './loading.module.css';
import { LoadingScreen } from './LoadingScreen';
import { startupSteps } from './startupSteps';

/** La pantalla de carga dura al menos esto, para que no parpadee. */
export const MIN_BOOT_MS = 1200;
/** Duración del fundido de salida. */
export const BOOT_FADE_MS = 300;
/** Tope de seguridad: si algo no responde, la capa sale igualmente. */
export const MAX_BOOT_MS = 10000;

/** Estado de las frases sin lanzar la consulta: la arranca AppLayout. */
function usePhrasesState(): 'loading' | 'done' {
  const queryClient = useQueryClient();
  const cache = queryClient.getQueryCache();
  const subscribe = useCallback((onChange: () => void) => cache.subscribe(onChange), [cache]);
  return useSyncExternalStore(subscribe, () => {
    const state = queryClient.getQueryState(PHRASES_KEY);
    return state && (state.data !== undefined || state.status === 'error') ? 'done' : 'loading';
  });
}

/**
 * Capa fija sobre el router: cubre el arranque y sale una sola vez. Mientras se ve, lo de debajo
 * (`children`) es inerte y `useBoot` avisa a los atajos de teclado. El modelo lo carga
 * `useSignModelBoot`.
 */
export function BootOverlay({ children }: Readonly<{ children?: ReactNode }>) {
  const session = useSession((s) => s.status);
  const model = useSignModel((s) => s.status);
  const phrases = usePhrasesState();
  const reduced = useReducedMotion();
  const [minElapsed, setMinElapsed] = useState(false);
  const [booted, setBooted] = useState(false);

  const [capped, setCapped] = useState(false);

  useEffect(() => {
    const min = setTimeout(() => setMinElapsed(true), MIN_BOOT_MS);
    const cap = setTimeout(() => setCapped(true), MAX_BOOT_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(cap);
    };
  }, []);

  const { steps, finished, progress } = startupSteps({ session, model, phrases });

  // Una vez fuera no vuelve: `booted` nunca se revierte.
  if (((finished && minElapsed) || capped) && !booted) setBooted(true);

  // Antes de pintar, para que ningún atajo se cuele entre el render y el efecto.
  useLayoutEffect(() => {
    useBoot.setState({ booting: !booted });
    return () => useBoot.setState({ booting: false });
  }, [booted]);

  return (
    <>
      <AnimatePresence>
        {!booted && (
          <motion.div
            className={styles.overlay}
            initial={false}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : BOOT_FADE_MS / 1000, ease: 'easeOut' }}
          >
            <LoadingScreen steps={steps} progress={progress} animate={!reduced} />
          </motion.div>
        )}
      </AnimatePresence>
      <div inert={!booted}>{children}</div>
    </>
  );
}
