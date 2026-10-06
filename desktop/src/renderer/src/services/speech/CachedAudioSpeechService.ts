import type { SpeakablePhrase, SpeechService } from './SpeechService';
import type { VoiceOptions } from './WebSpeechService';

/**
 * Espacio para la fase de TTS pregenerado/cacheado (ver docs/ARCHITECTURE.md).
 *
 * Reproduce un audio local por `phrase.code` si existe en `audioByCode`; si no,
 * delega en `fallback` (TTS del sistema). Hoy nadie le pasa audios, así que se
 * comporta como el fallback. En la Fase 4 este servicio es el que podrá enviar
 * el audio al cable virtual con `setSinkId`.
 */
export class CachedAudioSpeechService implements SpeechService {
  private audio: HTMLAudioElement | null = null;

  constructor(
    private readonly fallback: SpeechService,
    private readonly getOptions: () => VoiceOptions,
    private readonly audioByCode: Record<string, string> = {},
    private readonly createAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src),
  ) {}

  async speak(target: SpeakablePhrase | string): Promise<void> {
    const src = typeof target === 'string' ? undefined : this.audioByCode[target.code];
    if (!src) return this.fallback.speak(target);

    this.audio?.pause();
    const audio = this.createAudio(src);
    audio.volume = this.getOptions().volume;
    this.audio = audio;
    await audio.play();
  }

  stop(): void {
    this.audio?.pause();
    this.fallback.stop();
  }
}
