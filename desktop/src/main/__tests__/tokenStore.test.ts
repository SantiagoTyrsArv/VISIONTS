import { beforeEach, describe, expect, it } from 'vitest';

import { createTokenStore, type TokenStoreDeps } from '../tokenStore';

// safeStorage falso: "cifra" invirtiendo y marcando, para comprobar que no se guarda en claro.
function fakeDeps(available = true) {
  const files = new Map<string, Buffer>();
  const deps: TokenStoreDeps = {
    filePath: '/data/tokens.bin',
    safeStorage: {
      isEncryptionAvailable: () => available,
      encryptString: (s) => Buffer.from('ENC:' + [...s].reverse().join('')),
      decryptString: (b) => {
        const s = b.toString();
        if (!s.startsWith('ENC:')) throw new Error('bad');
        return [...s.slice(4)].reverse().join('');
      },
    },
    fs: {
      readFile: async (p) => {
        const v = files.get(p);
        if (!v) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return v;
      },
      writeFile: async (p, d) => void files.set(p, Buffer.from(d)),
      rm: async (p) => void files.delete(p),
    },
  };
  return { deps, files };
}

const tokens = { accessToken: 'a1', refreshToken: 'r1-secret' };

describe('tokenStore', () => {
  let env: ReturnType<typeof fakeDeps>;
  beforeEach(() => {
    env = fakeDeps();
  });

  it('guarda cifrado y lee lo guardado', async () => {
    const store = createTokenStore(env.deps);
    await store.save(tokens);

    const raw = env.files.get('/data/tokens.bin')!.toString();
    expect(raw).not.toContain('r1-secret');
    expect(await store.get()).toEqual(tokens);
  });

  it('get sin archivo devuelve null', async () => {
    expect(await createTokenStore(env.deps).get()).toBeNull();
  });

  it('clear borra el archivo', async () => {
    const store = createTokenStore(env.deps);
    await store.save(tokens);
    await store.clear();
    expect(env.files.size).toBe(0);
    expect(await store.get()).toBeNull();
  });

  it('archivo corrupto o con forma inválida devuelve null', async () => {
    const store = createTokenStore(env.deps);
    env.files.set('/data/tokens.bin', Buffer.from('basura'));
    expect(await store.get()).toBeNull();

    env.files.set('/data/tokens.bin', env.deps.safeStorage.encryptString('{"accessToken":1}'));
    expect(await store.get()).toBeNull();
  });

  it('sin cifrado disponible, save falla y no escribe nada', async () => {
    const { deps, files } = fakeDeps(false);
    await expect(createTokenStore(deps).save(tokens)).rejects.toThrow(/cifrado/i);
    expect(files.size).toBe(0);
  });
});
