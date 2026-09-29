import type { SpeakablePhrase, SpeechService } from './SpeechService';

export type VoiceOptions = { volume: number; rate: number; voiceURI: string | null };

/** TTS del sistema (Web Speech API). Es la implementación base y el fallback. */
export class WebSpeechService implements SpeechService {
  constructor(
    private readonly getOptions: () => VoiceOptions,
    private readonly synth: SpeechSynthesis = window.speechSynthesis,
  ) {}

  async speak(target: SpeakablePhrase | string): Promise<void> {
    const text = typeof target === 'string' ? target : target.text;
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
