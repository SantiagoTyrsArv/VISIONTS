import type { Tokens } from '../shared/ipc';

export type TokenStoreDeps = {
  filePath: string;
  safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(plain: string): Buffer;
    decryptString(encrypted: Buffer): string;
  };
  fs: {
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: Buffer): Promise<void>;
    rm(path: string): Promise<void>;
  };
};

function isTokens(v: unknown): v is Tokens {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Tokens).accessToken === 'string' &&
    typeof (v as Tokens).refreshToken === 'string'
  );
}

/**
 * Tokens cifrados con safeStorage (DPAPI en Windows) en un único archivo.
 * Nunca se escriben en claro: sin cifrado disponible, `save` falla.
 */
export function createTokenStore({ filePath, safeStorage, fs }: TokenStoreDeps) {
  return {
    async get(): Promise<Tokens | null> {
      try {
        const parsed: unknown = JSON.parse(safeStorage.decryptString(await fs.readFile(filePath)));
        return isTokens(parsed) ? parsed : null;
      } catch {
        // Sin archivo, corrupto o indescifrable: el usuario vuelve a iniciar sesión.
        return null;
      }
    },

    async save(tokens: Tokens): Promise<void> {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('El cifrado del sistema no está disponible; no se guarda la sesión.');
      }
      await fs.writeFile(filePath, safeStorage.encryptString(JSON.stringify(tokens)));
    },

    async clear(): Promise<void> {
      try {
        await fs.rm(filePath);
      } catch {
        // Ya no existía.
      }
    },
  };
}
