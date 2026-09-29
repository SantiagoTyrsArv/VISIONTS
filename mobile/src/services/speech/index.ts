import { useSettings } from '@/store/settings';

import { ExpoSpeechService } from './ExpoSpeechService';
import type { SpeechService } from './SpeechService';

export type { SpeakablePhrase, SpeechService } from './SpeechService';

const voiceOptions = () => {
  const { volume, rate } = useSettings.getState();
  return { volume, rate };
};

/**
 * Punto único donde se elige la implementación. Para activar audios cacheados,
 * envolver aquí con `new CachedAudioSpeechService(base, voiceOptions, audios)`.
 */
export const speechService: SpeechService = new ExpoSpeechService(voiceOptions);
