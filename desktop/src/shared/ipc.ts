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
  tts: {
    voices(): Promise<TtsVoice[]>;
    synthesize(items: SynthItem[]): Promise<SynthResult[]>;
    /** Borra los audios que no sean de esta voz y velocidad. */
    prune(keep: { voiceId: string | null; rate: number }): Promise<void>;
  };
  meeting: {
    enter(): Promise<{ failedShortcuts: string[] }>;
    exit(): Promise<void>;
    /** Ctrl+Alt+N durante el Modo reunión; devuelve la función para cancelar la suscripción. */
    onShortcut(callback: (index: number) => void): () => void;
  };
};

export const IPC = {
  tokensGet: 'tokens:get',
  tokensSave: 'tokens:save',
  tokensClear: 'tokens:clear',
  ttsVoices: 'tts:voices',
  ttsSynthesize: 'tts:synthesize',
  ttsPrune: 'tts:prune',
  meetingEnter: 'meeting:enter',
  meetingExit: 'meeting:exit',
  meetingShortcut: 'meeting:shortcut',
} as const;
