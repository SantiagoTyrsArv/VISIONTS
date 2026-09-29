import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import type { SpeakablePhrase, SpeechService } from './SpeechService';
import type { VoiceOptions } from './ExpoSpeechService';

/**
 * Espacio para la fase de TTS pregenerado/cacheado (ver docs/ARCHITECTURE.md).
 *
 * Reproduce un audio local por `phrase.code` si existe en `audioByCode`; si no,
 * delega en `fallback` (TTS del dispositivo). Hoy nadie le pasa audios, así que
 * en el MVP se comporta como el fallback. La descarga/caché de audios
 * pregenerados (voz de mejor calidad) se añadirá sin tocar a los consumidores.
 */
export class CachedAudioSpeechService implements SpeechService {
  private player: AudioPlayer | null = null;

  constructor(
    private readonly fallback: SpeechService,
    private readonly getVoiceOptions: () => VoiceOptions,
    private readonly audioByCode: Record<string, string> = {},
  ) {}

  async speak(target: SpeakablePhrase | string): Promise<void> {
    const uri = typeof target === 'string' ? undefined : this.audioByCode[target.code];
    if (!uri) return this.fallback.speak(target);

    this.player?.remove();
    const player = createAudioPlayer({ uri });
    player.volume = this.getVoiceOptions().volume;
    this.player = player;
    player.play();
  }

  stop(): void {
    this.player?.pause();
    this.fallback.stop();
  }
}
