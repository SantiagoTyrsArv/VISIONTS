import { useEffect, useState } from 'react';

import type { TtsVoice } from '../../../../shared/ipc';

/** Voces de Windows en español: las mismas con las que se generan los audios. */
export function useTtsVoices(): { voices: TtsVoice[]; loaded: boolean } {
  const [state, setState] = useState<{ voices: TtsVoice[]; loaded: boolean }>({
    voices: [],
    loaded: false,
  });
  useEffect(() => {
    let cancelled = false;
    window.senavoz.tts.voices().then(
      (voices) => !cancelled && setState({ voices, loaded: true }),
      () => !cancelled && setState({ voices: [], loaded: true }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
