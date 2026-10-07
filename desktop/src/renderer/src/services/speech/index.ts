import { useMeeting } from '@/store/meeting';
import { usePlayback } from '@/store/playback';
import { useSettings } from '@/store/settings';

import { GeneratedSpeechService } from './GeneratedSpeechService';
import { WebSpeechService } from './WebSpeechService';

export type { SpeakablePhrase, SpeechService } from './SpeechService';

// La voz del sistema solo se usa como respaldo fuera del Modo reunión, con su voz predeterminada.
const systemVoice = new WebSpeechService(() => {
  const { volume, rate } = useSettings.getState();
  return { volume, rate, voiceURI: null };
});

/** Punto único donde se elige la implementación. */
export const speechService = new GeneratedSpeechService({
  synthesize: (items) => window.senavoz.tts.synthesize(items),
  options: () => {
    const { volume, rate, voiceId } = useSettings.getState();
    return { volume, rate, voiceId };
  },
  route: () => {
    const m = useMeeting.getState();
    return { meeting: m.active, sinkId: m.sinkId, blocked: m.paused || m.deviceMissing };
  },
  fallback: systemVoice,
  events: {
    onSpoken: (text) => usePlayback.getState().spoke(text),
    onPlaying: (playing) => usePlayback.getState().setPlaying(playing),
    onError: (kind) =>
      kind === 'device'
        ? useMeeting.getState().setSink(null)
        : usePlayback.getState().setSynthError(true),
  },
});
