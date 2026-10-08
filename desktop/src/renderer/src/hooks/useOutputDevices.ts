import { useCallback, useEffect, useState } from 'react';

import { listOutputDevices, type OutputDevice } from '@/services/audio/outputDevice';

/** Salidas de audio; se actualiza al conectar o desconectar dispositivos. */
export function useOutputDevices() {
  const [state, setState] = useState<{ devices: OutputDevice[]; loaded: boolean }>({
    devices: [],
    loaded: false,
  });
  const refresh = useCallback(() => {
    listOutputDevices().then(
      (devices) => setState({ devices, loaded: true }),
      () => setState({ devices: [], loaded: true }),
    );
  }, []);
  useEffect(() => {
    refresh();
    const media = navigator.mediaDevices;
    media?.addEventListener?.('devicechange', refresh);
    return () => media?.removeEventListener?.('devicechange', refresh);
  }, [refresh]);
  return { ...state, refresh };
}
