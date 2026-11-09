import { useEffect, useRef } from 'react';

import { useSession } from '@/store/session';
import { useSignModel } from '@/store/signModel';

/**
 * El modelo va empaquetado: se carga una sola vez, al haber sesión, aunque se arranque en
 * /reunion (fuera de AppLayout). Lo llama `App`.
 */
export function useSignModelBoot(): void {
  const session = useSession((s) => s.status);
  const requested = useRef(false);
  useEffect(() => {
    if (session !== 'authenticated' || requested.current) return;
    requested.current = true;
    void useSignModel.getState().load();
  }, [session]);
}
