import * as Speech from 'expo-speech';

import type { SpeakablePhrase, SpeechService } from './SpeechService';

export type VoiceOptions = { volume: number; rate: number };

/** TTS del dispositivo (expo-speech). Es la implementación base y el fallback. */
export class ExpoSpeechService implements SpeechService {
  constructor(private readonly getVoiceOptions: () => VoiceOptions) {}

  async speak(target: SpeakablePhrase | string): Promise<void> {
    const text = typeof target === 'string' ? target : target.text;
    const { volume, rate } = this.getVoiceOptions();
    // Cancela lo que esté sonando para que toques rápidos no se encolen.
    await Speech.stop();
    Speech.speak(text, { language: 'es-ES', volume, rate });
  }

  stop(): void {
    void Speech.stop();
  }
}
