import type { SenavozApi, Tokens } from '../../../shared/ipc';

/** Sustituto en memoria del preload para los tests del renderer. */
export function installFakeSenavoz(): { stored: () => Tokens | null } {
  let stored: Tokens | null = null;
  const api: SenavozApi = {
    tokens: {
      get: async () => stored,
      save: async (t) => void (stored = t),
      clear: async () => void (stored = null),
    },
  };
  Object.defineProperty(window, 'senavoz', { value: api, configurable: true });
  return { stored: () => stored };
}
