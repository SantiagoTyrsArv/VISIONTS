import type { Tokens } from '../../../shared/ipc';

// Los tokens viven cifrados en el proceso main (safeStorage). Aquí solo se
// mantiene una copia en memoria para no cruzar el IPC en cada petición.
let cache: Tokens | null | undefined;

async function load(): Promise<Tokens | null> {
  if (cache === undefined) cache = await window.senavoz.tokens.get();
  return cache;
}

export type { Tokens };

export const tokenStorage = {
  getAccessToken: async () => (await load())?.accessToken ?? null,
  getRefreshToken: async () => (await load())?.refreshToken ?? null,

  async save(tokens: Tokens): Promise<void> {
    // Primero se persiste: si el cifrado falla, la sesión no queda "medio guardada".
    await window.senavoz.tokens.save(tokens);
    cache = tokens;
  },

  async clear(): Promise<void> {
    cache = null;
    await window.senavoz.tokens.clear();
  },
};
