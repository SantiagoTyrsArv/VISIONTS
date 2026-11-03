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
      get: () => Promise.resolve(stored),
      save: (t) => {
        stored = t;
        return Promise.resolve();
      },
      clear: () => {
        stored = null;
        return Promise.resolve();
      },
    },
    tts: {
      voices: vi.fn(() => Promise.resolve(options.voices ?? [])),
      synthesize: vi.fn(
        options.synthesize ??
          ((items: SynthItem[]) =>
            Promise.resolve(items.map(() => ({ ok: true as const, wav: new ArrayBuffer(8) })))),
      ),
      prune: vi.fn(() => Promise.resolve()),
    },
    meeting: {
      enter: vi.fn(() => Promise.resolve({ failedShortcuts: options.failedShortcuts ?? [] })),
      exit: vi.fn(() => Promise.resolve()),
      onShortcut: (callback) => {
        shortcutListeners.add(callback);
        return () => {
          shortcutListeners.delete(callback);
        };
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
