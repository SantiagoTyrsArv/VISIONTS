import { useSettings } from '@/store/settings';

import type { SpeechService } from './SpeechService';
import { WebSpeechService } from './WebSpeechService';

export type { SpeakablePhrase, SpeechService } from './SpeechService';

const voiceOptions = () => {
  const { volume, rate, voiceURI } = useSettings.getState();
  return { volume, rate, voiceURI };
};

/**
 * Punto único donde se elige la implementación. Para activar audios cacheados,
 * envolver aquí con `new CachedAudioSpeechService(base, voiceOptions, audios)`.
 */
export const speechService: SpeechService = new WebSpeechService(voiceOptions);
