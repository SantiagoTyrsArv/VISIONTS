export type Tokens = { accessToken: string; refreshToken: string };

/** Voz de Windows (OneCore) en español. */
export type TtsVoice = { id: string; name: string; lang: string };
/** Una frase a sintetizar con la voz y velocidad de ajustes (voiceId null = predeterminada). */
export type SynthItem = { text: string; voiceId: string | null; rate: number };
export type SynthResult = { ok: true; wav: ArrayBuffer } | { ok: false; error: string };

/** Única API que el preload expone al renderer. */
export type SenavozApi = {
  tokens: {
    get(): Promise<Tokens | null>;
    save(tokens: Tokens): Promise<void>;
    clear(): Promise<void>;
  };
};

export const IPC = {
  tokensGet: 'tokens:get',
  tokensSave: 'tokens:save',
  tokensClear: 'tokens:clear',
} as const;
