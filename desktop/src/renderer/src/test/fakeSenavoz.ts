import { vi } from 'vitest';

import type { SenavozApi, SynthItem, SynthResult, Tokens, TtsVoice } from '../../../shared/ipc';

type Options = {
  voices?: TtsVoice[];
  synthesize?: (items: SynthItem[]) => Promise<SynthResult[]>;
  failedShortcuts?: string[];
};

/** Sustituto en memoria del preload para los tests del renderer. */
export function installFakeSenavoz(options: Options = {}) {
  let stored: Tokens | null = null;
  const shortcutListeners = new Set<(index: number) => void>();
  const api: SenavozApi = {
    tokens: {
      get: async () => stored,
      save: async (t) => void (stored = t),
      clear: async () => void (stored = null),
    },
    tts: {
      voices: vi.fn(async () => options.voices ?? []),
      synthesize: vi.fn(
        options.synthesize ??
          (async (items: SynthItem[]) =>
            items.map(() => ({ ok: true as const, wav: new ArrayBuffer(8) }))),
      ),
      prune: vi.fn(async () => {}),
    },
    meeting: {
      enter: vi.fn(async () => ({ failedShortcuts: options.failedShortcuts ?? [] })),
      exit: vi.fn(async () => {}),
      onShortcut: (callback) => {
        shortcutListeners.add(callback);
        return () => void shortcutListeners.delete(callback);
      },
    },
  };
  Object.defineProperty(window, 'senavoz', { value: api, configurable: true });
  return {
    stored: () => stored,
    api,
    pressShortcut: (index: number) => shortcutListeners.forEach((cb) => cb(index)),
  };
}
