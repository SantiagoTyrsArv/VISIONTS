export type Tokens = { accessToken: string; refreshToken: string };

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
