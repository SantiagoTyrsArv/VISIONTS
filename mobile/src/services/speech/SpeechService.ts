/** Frase identificable por código (p. ej. "yes") con su texto en español. */
export type SpeakablePhrase = { code: string; text: string };

export interface SpeechService {
  /** Reproduce una frase del catálogo (por código) o un texto libre. */
  speak(target: SpeakablePhrase | string): Promise<void>;
  stop(): void;
}
