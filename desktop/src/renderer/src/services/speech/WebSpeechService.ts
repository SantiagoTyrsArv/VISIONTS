import type { SpeakablePhrase, SpeechService } from './SpeechService';

export type VoiceOptions = { volume: number; rate: number; voiceURI: string | null };

/** TTS del sistema (Web Speech API). Es la implementación base y el fallback. */
export class WebSpeechService implements SpeechService {
  constructor(
    private readonly getOptions: () => VoiceOptions,
    private readonly synth: SpeechSynthesis = window.speechSynthesis,
  ) {}

  // Sin async (no espera nada), pero un fallo sigue llegando como promesa rechazada.
  speak(target: SpeakablePhrase | string): Promise<void> {
    try {
      this.say(typeof target === 'string' ? target : target.text);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private say(text: string): void {
    const { volume, rate, voiceURI } = this.getOptions();
    // Cancela lo que esté sonando para que clics rápidos no se encolen.
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.volume = volume;
    utterance.rate = rate;
    // Si la voz guardada ya no está instalada, null = predeterminada del sistema.
    utterance.voice = this.synth.getVoices().find((v) => v.voiceURI === voiceURI) ?? null;
    this.synth.speak(utterance);
  }

  stop(): void {
    this.synth.cancel();
  }
}
