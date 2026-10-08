import type { SynthItem, SynthResult } from '../../../../shared/ipc';
import type { SpeakablePhrase, SpeechService } from './SpeechService';

/** Adónde va la voz ahora mismo. */
export type SpeechRoute = {
  /** Modo reunión: la voz solo puede salir por `sinkId`, nunca por los altavoces. */
  meeting: boolean;
  sinkId: string;
  /** Voz en pausa o micrófono virtual ausente. */
  blocked: boolean;
};

export type GeneratedSpeechDeps = {
  synthesize: (items: SynthItem[]) => Promise<SynthResult[]>;
  options: () => { volume: number; rate: number; voiceId: string | null };
  route: () => SpeechRoute;
  /** Voz del sistema (Web Speech): solo fuera del Modo reunión. */
  fallback: SpeechService;
  events?: {
    onSpoken?: (text: string) => void;
    onPlaying?: (playing: boolean) => void;
    onError?: (kind: 'synth' | 'device') => void;
  };
  createAudio?: () => HTMLAudioElement;
  toUrl?: (wav: ArrayBuffer) => string;
};

/**
 * Reproduce audio generado con las voces de Windows (ver docs/ARCHITECTURE.md). A
 * diferencia de speechSynthesis, un HTMLAudioElement puede elegir el dispositivo de
 * salida con setSinkId: así la voz llega al micrófono virtual de la reunión.
 */
export class GeneratedSpeechService implements SpeechService {
  private audio: HTMLAudioElement | null = null;
  private readonly urls = new Map<string, string>();

  constructor(private readonly deps: GeneratedSpeechDeps) {}

  private combo(): { voiceId: string | null; rate: number; prefix: string } {
    const { voiceId, rate } = this.deps.options();
    return { voiceId, rate, prefix: `${voiceId ?? ''}|${rate}|` };
  }

  private toUrl(wav: ArrayBuffer): string {
    return this.deps.toUrl
      ? this.deps.toUrl(wav)
      : URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  }

  /** Genera en un lote los audios que falten y libera los de otras voces o velocidades. */
  async warm(texts: string[]): Promise<void> {
    const { voiceId, rate, prefix } = this.combo();
    for (const [key, url] of this.urls) {
      if (!key.startsWith(prefix)) {
        if (!this.deps.toUrl) URL.revokeObjectURL(url);
        this.urls.delete(key);
      }
    }
    const missing = [...new Set(texts)].filter((t) => !this.urls.has(prefix + t));
    if (missing.length === 0) return;
    const results = await this.deps.synthesize(missing.map((text) => ({ text, voiceId, rate })));
    results.forEach((r, i) => {
      if (r.ok) this.urls.set(prefix + missing[i], this.toUrl(r.wav));
    });
  }

  private async urlFor(text: string): Promise<string | null> {
    const { voiceId, rate, prefix } = this.combo();
    const cached = this.urls.get(prefix + text);
    if (cached) return cached;
    let result: SynthResult | undefined;
    try {
      [result] = await this.deps.synthesize([{ text, voiceId, rate }]);
    } catch {
      return null;
    }
    if (!result?.ok) return null;
    const url = this.toUrl(result.wav);
    this.urls.set(prefix + text, url);
    return url;
  }

  /** `sinkOverride`: manda una prueba a ese dispositivo aunque no haya reunión. */
  async speak(target: SpeakablePhrase | string, sinkOverride?: string): Promise<void> {
    const text = typeof target === 'string' ? target : target.text;
    const route: SpeechRoute =
      sinkOverride !== undefined
        ? { meeting: true, sinkId: sinkOverride, blocked: false }
        : this.deps.route();
    const events = this.deps.events ?? {};
    if (route.meeting && route.blocked) return;

    const url = await this.urlFor(text);
    if (!url) {
      if (route.meeting) {
        events.onError?.('synth');
        return;
      }
      events.onSpoken?.(text);
      return this.deps.fallback.speak(target);
    }

    this.stopAudio();
    this.deps.fallback.stop();
    const audio = this.deps.createAudio ? this.deps.createAudio() : new Audio();
    audio.src = url;
    audio.volume = this.deps.options().volume;
    audio.onended = () => {
      if (this.audio === audio) events.onPlaying?.(false);
    };
    this.audio = audio;
    try {
      await audio.setSinkId(route.meeting ? route.sinkId : '');
    } catch {
      if (route.meeting) {
        events.onError?.('device');
        return;
      }
    }
    events.onSpoken?.(text);
    events.onPlaying?.(true);
    await audio.play();
  }

  private stopAudio(): void {
    this.audio?.pause();
    this.audio = null;
  }

  stop(): void {
    this.stopAudio();
    this.deps.fallback.stop();
    this.deps.events?.onPlaying?.(false);
  }
}
