# SeñaVoz Escritorio (app base) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la app móvil Expo por una app de escritorio Electron para Windows que haga todo lo que hacía el MVP (auth con sesión persistente, frases con voz, cámara con reconocedor simulado, ajustes), y eliminar `mobile/`.

**Architecture:** `desktop/` con electron-vite: **main** (ventana, protocolo `app://senavoz`, tokens cifrados con `safeStorage`, IPC) → **preload** (`window.senavoz.tokens` vía `contextBridge`) → **renderer** React con toda la lógica, portada de `mobile/src` y sustituyendo solo las piezas de plataforma. La lógica del main se escribe como funciones puras con dependencias inyectadas para poder testearla sin Electron.

**Tech Stack:** Electron 44, electron-vite 5 (Vite 8), React 19, TypeScript, react-router 8, Zustand 5, TanStack Query 5, axios, react-hook-form + zod 4, CSS Modules, Vitest 5 + Testing Library + jsdom, electron-builder 26 (NSIS). Backend: FastAPI (solo cambia CORS).

**Spec:** `docs/superpowers/specs/2026-09-29-desktop-app-design.md`

## Global Constraints

- Plataforma objetivo: **Windows**. No introducir código que rompa macOS/Linux a propósito, pero no se prueban.
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. El preload solo expone `window.senavoz.tokens.{get, save, clear}`.
- Los tokens **solo** se guardan cifrados con `safeStorage` en `userData`; si el cifrado no está disponible, `save` lanza error y **no escribe nada**. Nunca en `localStorage`.
- Preferencias no sensibles (volumen, velocidad, voz, cámara) en `localStorage` con zustand `persist`, clave `senavoz.settings`.
- Variable de entorno del renderer: `RENDERER_VITE_API_URL`, por defecto `http://localhost:8000`.
- Orígenes de la app: `app://senavoz` (producción) y `http://localhost:5173` (desarrollo). Ambos en `CORS_ORIGINS` del backend.
- Todos los textos de UI salen de `src/renderer/src/i18n/es.ts` vía `t()`; solo español. Mensajes idénticos a los del móvil donde ya existían.
- Voz: `lang = 'es-ES'`; cancelar lo que suena antes de hablar.
- Contraseña nueva: ≥ 8, al menos una letra y un número (mismas reglas que el backend). Email: trim + minúsculas antes de enviar.
- Commits con prefijos convencionales en español, como el historial (`feat(desktop): …`, `chore: …`), terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Directorio de trabajo para comandos npm: `desktop/`. Para pytest: `backend/` con `.venv` activado (`backend/.venv/Scripts/python -m pytest`).

## Review Focus

1. **La cámara guardada en ajustes ya no existe** (webcam desenchufada) → la app debe caer a la cámara por defecto, no quedarse en error. Test en Task 8 (`openCamera` con `OverconstrainedError`/`NotFoundError` en el `deviceId` guardado reintenta sin él).
2. **Cámara en uso por otra app (Zoom/Teams abiertos)** → mensaje específico "la cámara está en uso", no uno genérico. Test en Task 8 (`cameraErrorKey`).
3. **Atajos con modificadores o escribiendo** (`Ctrl+1` cambia de pestaña en muchos contextos; escribir "1" en un campo) → no deben reproducir voz. Test en Task 7.
4. **Las voces del sistema cargan de forma asíncrona** (`getVoices()` vacío al arrancar) → el selector debe rellenarse cuando llega `voiceschanged`. Test en Task 6 (`useSpanishVoices`).
5. **URLs del protocolo con traversal codificado** (`%2e%2e%2f`) o backslashes de Windows → 404, nunca servir fuera de la carpeta de la UI. Test en Task 3.

---

## Mapa de archivos

```
desktop/
├── package.json, electron.vite.config.ts, electron-builder.yml, vitest.config.ts
├── tsconfig.json, tsconfig.node.json, tsconfig.web.json, .env.example
├── resources/icon.png                      # copiado de mobile/assets/images/icon.png
└── src/
    ├── shared/ipc.ts                       # contrato IPC (tipos + nombres de canal)
    ├── main/
    │   ├── index.ts                        # arranque: protocolo, ventana, IPC
    │   ├── tokenStore.ts                   # cifrado/lectura de tokens (puro, inyectable)
    │   ├── appProtocol.ts                  # resolución segura de rutas app://
    │   ├── security.ts                     # permisos, navegación, window.open
    │   └── __tests__/{tokenStore,appProtocol,security}.test.ts
    ├── preload/index.ts
    └── renderer/
        ├── index.html                      # CSP
        └── src/
            ├── main.tsx, App.tsx, env.d.ts, styles.css
            ├── i18n/{es,index}.ts
            ├── config/env.ts
            ├── api/{client,endpoints,errors,types,queryClient,usePhrases}.ts
            ├── auth/{schemas,tokenStorage}.ts
            ├── store/{session,settings}.ts
            ├── services/speech/{SpeechService,WebSpeechService,CachedAudioSpeechService,useSpanishVoices,index}.ts
            ├── services/recognition/{SignRecognizer,MockSignRecognizer}.ts
            ├── services/camera/camera.ts
            ├── hooks/usePhraseShortcuts.ts
            ├── ui/{Button,FormField,AuthScreen,PhraseCard,Splash}.tsx + *.module.css
            ├── routes/{Guard,AppLayout,Login,Register,Phrases,Camera,Settings}.tsx + *.module.css
            └── __tests__/…
```

---

### Task 1: Scaffold de `desktop/` con electron-vite, Vitest y alias

**Files:**
- Create: `desktop/` (scaffold), `desktop/vitest.config.ts`, `desktop/.env.example`, `desktop/src/renderer/src/__tests__/smoke.test.ts`
- Modify: `desktop/package.json`, `desktop/electron.vite.config.ts`, `desktop/tsconfig.web.json`, `desktop/tsconfig.node.json`

**Interfaces:**
- Produces: alias `@/` → `src/renderer/src/` (Vite y TS); scripts `dev`, `build`, `typecheck`, `test`; proyectos Vitest `main` (node) y `renderer` (jsdom, setup `src/renderer/src/test/setup.ts`).

- [ ] **Step 1: Generar el scaffold**

Desde la raíz del repo:
```bash
npm create @quick-start/electron@latest desktop -- --template react-ts --skip
```
Si el CLI pregunta de forma interactiva (no debería con `--skip`), elegir: React, TypeScript, sin updater. Luego:
```bash
cd desktop && npm install
```
Borrar lo que no se usará: `src/renderer/src/components/`, `src/renderer/src/assets/` (salvo que `main.tsx` importe un css de ahí; en ese caso se reescribe en el Task 5), y cualquier `electron-builder` config de macOS/Linux se ajusta en el Task 11.

- [ ] **Step 2: Instalar dependencias de la app y de test**

```bash
npm install react-router zustand @tanstack/react-query axios react-hook-form @hookform/resolvers zod
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 3: Alias `@/` y proyectos de test**

En `electron.vite.config.ts`, sección `renderer`, añadir (o mantener si ya existe `@renderer`, y añadir `@`):
```ts
resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
```
y en la sección `preload` asegurar el bundle completo (requisito de `sandbox: true`):
```ts
preload: { build: { externalizeDeps: false } },
```
En `tsconfig.web.json`, dentro de `compilerOptions.paths`: `"@/*": ["src/renderer/src/*"]`, y añadir `"src/shared/**/*"` a `include`. En `tsconfig.node.json` añadir `"src/shared/**/*"` a `include`.

Crear `desktop/vitest.config.ts`:
```ts
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'main', environment: 'node', include: ['src/main/**/*.test.ts'] },
      },
      {
        plugins: [react()],
        resolve: { alias: { '@': resolve(__dirname, 'src/renderer/src') } },
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/renderer/src/**/*.test.{ts,tsx}'],
          setupFiles: ['src/renderer/src/test/setup.ts'],
          env: { RENDERER_VITE_API_URL: 'http://api.test' },
        },
      },
    ],
  },
});
```
Crear `src/renderer/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Scripts y `.env.example`**

En `package.json` → `scripts` (conservando los del scaffold como `dev`, `build`, `start`):
```json
"typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
"test": "vitest run",
"test:watch": "vitest"
```
`desktop/.env.example`:
```
# URL de la API de SeñaVoz, accesible desde este PC.
RENDERER_VITE_API_URL=http://localhost:8000
```

- [ ] **Step 5: Smoke test del alias**

`src/renderer/src/__tests__/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

describe('entorno de test', () => {
  it('expone la URL de la API de test', () => {
    expect(import.meta.env.RENDERER_VITE_API_URL).toBe('http://api.test');
  });
});
```
Run: `npm test` → Expected: PASS (1 test). Run: `npm run typecheck` → sin errores.

- [ ] **Step 6: Commit**

```bash
git add desktop
git commit -m "chore(desktop): scaffold electron-vite + React + Vitest"
```

---

### Task 2: Almacén de tokens cifrado, contrato IPC y preload

**Files:**
- Create: `desktop/src/shared/ipc.ts`, `desktop/src/main/tokenStore.ts`, `desktop/src/main/__tests__/tokenStore.test.ts`
- Modify: `desktop/src/preload/index.ts` (reemplazar), `desktop/src/preload/index.d.ts` (reemplazar o borrar), `desktop/src/renderer/src/env.d.ts`

**Interfaces:**
- Produces:
  ```ts
  // shared/ipc.ts
  export type Tokens = { accessToken: string; refreshToken: string };
  export type SenavozApi = { tokens: { get(): Promise<Tokens | null>; save(t: Tokens): Promise<void>; clear(): Promise<void> } };
  export const IPC = { tokensGet: 'tokens:get', tokensSave: 'tokens:save', tokensClear: 'tokens:clear' } as const;
  // main/tokenStore.ts
  export function createTokenStore(deps: TokenStoreDeps): { get(): Promise<Tokens | null>; save(t: Tokens): Promise<void>; clear(): Promise<void> };
  ```
  Global en renderer: `window.senavoz: SenavozApi`.

- [ ] **Step 1: Contrato compartido**

`src/shared/ipc.ts`:
```ts
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
```

- [ ] **Step 2: Test del almacén (falla)**

`src/main/__tests__/tokenStore.test.ts`:
```ts
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
```
Run: `npm test -- --project main` → Expected: FAIL (`Cannot find module '../tokenStore'`).

- [ ] **Step 3: Implementación**

`src/main/tokenStore.ts`:
```ts
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
```
Run: `npm test -- --project main` → Expected: PASS (5 tests).

- [ ] **Step 4: Preload y tipos globales**

`src/preload/index.ts` (reemplaza el del scaffold, que expone `electronAPI`):
```ts
import { contextBridge, ipcRenderer } from 'electron';

import { IPC, type SenavozApi, type Tokens } from '../shared/ipc';

const api: SenavozApi = {
  tokens: {
    get: () => ipcRenderer.invoke(IPC.tokensGet),
    save: (tokens: Tokens) => ipcRenderer.invoke(IPC.tokensSave, tokens),
    clear: () => ipcRenderer.invoke(IPC.tokensClear),
  },
};

contextBridge.exposeInMainWorld('senavoz', api);
```
Borrar `src/preload/index.d.ts` del scaffold y quitar `@electron-toolkit/preload` de `package.json` si queda sin uso. En `src/renderer/src/env.d.ts`:
```ts
/// <reference types="vite/client" />
import type { SenavozApi } from '../../shared/ipc';

declare global {
  interface Window {
    senavoz: SenavozApi;
  }
  interface ImportMetaEnv {
    readonly RENDERER_VITE_API_URL?: string;
  }
}
export {};
```
(El registro de los handlers IPC en main se hace en el Task 3, que reescribe `main/index.ts`.)

Run: `npm run typecheck` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add desktop/src
git commit -m "feat(desktop): almacén de tokens cifrado con safeStorage y API de preload"
```

---

### Task 3: Proceso main — protocolo `app://`, seguridad y ventana

**Files:**
- Create: `desktop/src/main/appProtocol.ts`, `desktop/src/main/security.ts`, `desktop/src/main/__tests__/appProtocol.test.ts`, `desktop/src/main/__tests__/security.test.ts`
- Modify: `desktop/src/main/index.ts` (reemplazar), `desktop/src/renderer/index.html`

**Interfaces:**
- Consumes: `createTokenStore`, `IPC` (Task 2).
- Produces:
  ```ts
  export const APP_ORIGIN = 'app://senavoz';
  export function resolveAppPath(root: string, requestUrl: string): { kind: 'file'; path: string } | { kind: 'notFound' };
  export function isTrustedOrigin(url: string, devUrl: string | undefined): boolean;
  export function allowPermission(permission: string, requestingUrl: string, devUrl: string | undefined): boolean;
  ```

- [ ] **Step 1: Tests del protocolo (fallan)**

`src/main/__tests__/appProtocol.test.ts`:
```ts
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveAppPath } from '../appProtocol';

const root = resolve('/app/renderer');
const exists = new Set([join(root, 'index.html'), join(root, 'assets', 'index-abc.js')]);
const fileExists = (p: string) => exists.has(p);

describe('resolveAppPath', () => {
  it('sirve archivos existentes dentro de la raíz', () => {
    expect(resolveAppPath(root, 'app://senavoz/assets/index-abc.js', fileExists)).toEqual({
      kind: 'file',
      path: join(root, 'assets', 'index-abc.js'),
    });
  });

  it('la raíz y rutas desconocidas devuelven index.html', () => {
    expect(resolveAppPath(root, 'app://senavoz/', fileExists)).toEqual({ kind: 'file', path: join(root, 'index.html') });
    expect(resolveAppPath(root, 'app://senavoz/ajustes', fileExists)).toEqual({ kind: 'file', path: join(root, 'index.html') });
  });

  // El parser de URL ya colapsa los segmentos ".." literales; lo importante es
  // que NINGUNA URL resuelva fuera de la raíz (como mucho, cae a index.html).
  it.each([
    'app://senavoz/../secret.txt',
    'app://senavoz/%2e%2e/secret.txt',
    'app://senavoz/assets/%2e%2e/%2e%2e/secret.txt',
  ])('segmentos .. nunca salen de la raíz: %s', (url) => {
    const r = resolveAppPath(root, url, fileExists);
    if (r.kind === 'file') expect(r.path.startsWith(root)).toBe(true);
  });

  // Barras codificadas dentro de un segmento sobreviven al parser: 404 explícito.
  it.each([
    'app://senavoz/%2e%2e%2fsecret.txt',
    'app://senavoz/..%5csecret.txt',
    'app://senavoz/assets%2f..%2f..%2fsecret.txt',
    'app://senavoz/C:%5cWindows%5cwin.ini',
  ])('rechaza escapes codificados: %s', (url) => {
    expect(resolveAppPath(root, url, fileExists)).toEqual({ kind: 'notFound' });
  });

  it('rechaza otro host', () => {
    expect(resolveAppPath(root, 'app://otro/index.html', fileExists)).toEqual({ kind: 'notFound' });
  });
});
```
Run: `npm test -- --project main` → Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementación del protocolo**

`src/main/appProtocol.ts`:
```ts
import { existsSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'senavoz';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export type Resolved = { kind: 'file'; path: string } | { kind: 'notFound' };

/**
 * Traduce una URL app://senavoz/... a un archivo dentro de `root`. Cualquier
 * ruta que (tras decodificar) salga de `root` es 404. Rutas sin archivo → index.html
 * (la app usa HashRouter, pero así una recarga nunca muestra un error).
 */
export function resolveAppPath(
  root: string,
  requestUrl: string,
  fileExists: (p: string) => boolean = existsSync,
): Resolved {
  let url: URL;
  let pathname: string;
  try {
    url = new URL(requestUrl);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { kind: 'notFound' };
  }
  if (url.host !== APP_HOST) return { kind: 'notFound' };

  const rootAbs = resolve(root);
  // Se normalizan también las barras invertidas de Windows antes de comprobar.
  const candidate = resolve(rootAbs, normalize('.' + pathname.replace(/\\/g, '/')));
  const rel = relative(rootAbs, candidate);
  if (rel.startsWith('..') || isAbsolute(rel) || /[:]/.test(pathname)) return { kind: 'notFound' };

  if (rel !== '' && fileExists(candidate)) return { kind: 'file', path: candidate };
  return { kind: 'file', path: join(rootAbs, 'index.html') };
}
```
Nota para el implementador: si algún caso de `it.each` no da 404, **no** relajar el test; endurecer la función (el test es la especificación). En particular, `%2e%2e%2f` decodifica a `../` y debe dar 404.

Run: `npm test -- --project main` → Expected: PASS.

- [ ] **Step 3: Tests de seguridad (fallan)**

`src/main/__tests__/security.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { allowPermission, isTrustedOrigin } from '../security';

const dev = 'http://localhost:5173';

describe('isTrustedOrigin', () => {
  it('acepta app://senavoz y el servidor de desarrollo', () => {
    expect(isTrustedOrigin('app://senavoz/index.html', undefined)).toBe(true);
    expect(isTrustedOrigin('http://localhost:5173/#/frases', dev)).toBe(true);
  });

  it('rechaza el resto', () => {
    expect(isTrustedOrigin('http://localhost:5173/', undefined)).toBe(false);
    expect(isTrustedOrigin('https://evil.example/', dev)).toBe(false);
    expect(isTrustedOrigin('app://otro/', dev)).toBe(false);
    expect(isTrustedOrigin('no es url', dev)).toBe(false);
  });
});

describe('allowPermission', () => {
  it('solo concede media a orígenes propios', () => {
    expect(allowPermission('media', 'app://senavoz/', undefined)).toBe(true);
    expect(allowPermission('media', 'https://evil.example/', undefined)).toBe(false);
    expect(allowPermission('geolocation', 'app://senavoz/', undefined)).toBe(false);
    expect(allowPermission('notifications', 'app://senavoz/', undefined)).toBe(false);
  });
});
```

- [ ] **Step 4: Implementación de seguridad**

`src/main/security.ts`:
```ts
import { APP_ORIGIN } from './appProtocol';

export function isTrustedOrigin(url: string, devUrl: string | undefined): boolean {
  try {
    const origin = new URL(url).origin;
    // Los esquemas propios dan origin "null" en Node; se compara por prefijo en ese caso.
    if (url.startsWith(`${APP_ORIGIN}/`) || url === APP_ORIGIN) return true;
    return devUrl !== undefined && origin === new URL(devUrl).origin;
  } catch {
    return false;
  }
}

/** Solo la cámara (permiso "media") y solo para la propia app. */
export function allowPermission(permission: string, requestingUrl: string, devUrl: string | undefined): boolean {
  return permission === 'media' && isTrustedOrigin(requestingUrl, devUrl);
}
```
Run: `npm test -- --project main` → Expected: PASS.

- [ ] **Step 5: `main/index.ts`**

Reemplazar `src/main/index.ts`:
```ts
import { app, BrowserWindow, ipcMain, net, protocol, safeStorage, session, shell } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { IPC, type Tokens } from '../shared/ipc';
import { APP_ORIGIN, APP_SCHEME, resolveAppPath } from './appProtocol';
import { allowPermission, isTrustedOrigin } from './security';
import { createTokenStore } from './tokenStore';

const devUrl = !app.isPackaged ? process.env['ELECTRON_RENDERER_URL'] : undefined;
const rendererRoot = join(__dirname, '../renderer');

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerIpc() {
  const store = createTokenStore({
    filePath: join(app.getPath('userData'), 'session.bin'),
    safeStorage,
    fs: { readFile, writeFile, rm: (p) => rm(p, { force: true }) },
  });
  ipcMain.handle(IPC.tokensGet, () => store.get());
  ipcMain.handle(IPC.tokensSave, (_e, tokens: Tokens) => store.save(tokens));
  ipcMain.handle(IPC.tokensClear, () => store.clear());
}

function applySecurity() {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(allowPermission(permission, details.requestingUrl, devUrl));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
    allowPermission(permission, requestingOrigin, devUrl),
  );
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedOrigin(url, devUrl)) event.preventDefault();
    });
    contents.setWindowOpenHandler(({ url }) => {
      // Enlaces externos (si los hubiera) se abren en el navegador, nunca en la app.
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0B1220',
    title: 'SeñaVoz',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  protocol.handle(APP_SCHEME, (request) => {
    const resolved = resolveAppPath(rendererRoot, request.url);
    if (resolved.kind === 'notFound') return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(resolved.path).toString());
  });
  registerIpc();
  applySecurity();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```
Si el preload compilado se llama `index.mjs` (según la config del scaffold), ajustar la ruta `preload`.

- [ ] **Step 6: CSP en `index.html`**

En `src/renderer/index.html`, sustituir la meta CSP del scaffold por:
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: data:; connect-src 'self' %RENDERER_VITE_API_URL%"
/>
<title>SeñaVoz</title>
```
electron-vite expone al renderer las variables `RENDERER_VITE_*` y Vite sustituye `%VAR%` en el HTML. Crear `desktop/.env` local (ignorado por git) copiando `.env.example`. Si la variable faltara, Vite deja el literal `%RENDERER_VITE_API_URL%` y las llamadas a la API fallarían por CSP: por eso `.env.example` es obligatorio en el README (Task 12).

- [ ] **Step 7: Verificar**

Run: `npm test` → PASS. `npm run typecheck` → sin errores. `npm run dev` → se abre la ventana (aún con la UI del scaffold) sin errores en la consola del main.

- [ ] **Step 8: Commit**

```bash
git add desktop
git commit -m "feat(desktop): protocolo app://, permisos restringidos, CSP y ventana principal"
```

---

### Task 4: Núcleo del renderer — i18n, API, tokens, sesión

**Files:**
- Create: `src/renderer/src/i18n/{es,index}.ts`, `config/env.ts`, `api/{client,endpoints,errors,types,queryClient,usePhrases}.ts`, `auth/{schemas,tokenStorage}.ts`, `store/session.ts`, `test/fakeSenavoz.ts`, `__tests__/{client,session}.test.ts`
- Modify: `src/renderer/src/test/setup.ts`

(Todas las rutas relativas a `desktop/src/renderer/src/`.)

**Interfaces:**
- Consumes: `window.senavoz.tokens` (Task 2).
- Produces:
  ```ts
  t(key: TranslationKey, params?: Record<string,string>): string
  tokenStorage: { getAccessToken(): Promise<string|null>; getRefreshToken(): Promise<string|null>; save(t: Tokens): Promise<void>; clear(): Promise<void> }
  http (axios), setAuthFailureHandler(fn), apiErrorStatus(e), isNetworkError(e)
  authApi.{register,login,logout}, usersApi.me, phrasesApi.list, usePhrases(), PHRASES_KEY, queryClient
  messageForAuthError(e, 'login'|'register'): string
  loginSchema, registerSchema, LoginForm, RegisterForm
  useSession: { status: 'loading'|'authenticated'|'unauthenticated'; user: User|null; restore; login(email,pw); register(email,pw,name); logout }
  types: User, TokenPair, Phrase
  ```

- [ ] **Step 1: Copiar los módulos sin cambios de plataforma**

Copiar **tal cual** desde `mobile/src/` a `desktop/src/renderer/src/`: `api/client.ts`, `api/endpoints.ts`, `api/errors.ts`, `api/queryClient.ts`, `api/types.ts`, `api/usePhrases.ts`, `auth/schemas.ts`, `i18n/index.ts`, `store/session.ts`.
```bash
cd <repo>
for f in api/client.ts api/endpoints.ts api/errors.ts api/queryClient.ts api/types.ts api/usePhrases.ts auth/schemas.ts i18n/index.ts store/session.ts; do mkdir -p desktop/src/renderer/src/$(dirname $f); cp mobile/src/$f desktop/src/renderer/src/$f; done
```

- [ ] **Step 2: i18n `es.ts` con las claves de escritorio**

Copiar `mobile/src/i18n/es.ts` y aplicar estos cambios (el resto de claves igual):
- Renombrar `'tabs.*'` a `'nav.home'`, `'nav.camera'`, `'nav.settings'` (mismos textos).
- `'home.hint'`: `'Haz clic en una frase para reproducirla. Atajos: teclas 1–9'`.
- Eliminar `'camera.permissionGrant'`, `'camera.openSettings'`, `'camera.permissionBody'`.
- `'camera.permissionDenied'`: `'Windows bloqueó el acceso a la cámara. Actívalo en Configuración › Privacidad › Cámara y vuelve a intentarlo.'`
- Añadir:
  ```ts
  'app.loading': 'Cargando…',
  'nav.label': 'Navegación principal',
  'camera.starting': 'Iniciando cámara…',
  'camera.noCamera': 'No se encontró ninguna cámara. Conecta una webcam y vuelve a intentarlo.',
  'camera.inUse': 'La cámara está en uso por otra aplicación. Ciérrala y vuelve a intentarlo.',
  'camera.error': 'No se pudo iniciar la cámara.',
  'camera.retry': 'Reintentar',
  'camera.select': 'Cámara',
  'settings.voiceName': 'Voz del sistema',
  'settings.voiceDefault': 'Predeterminada del sistema',
  'settings.noSpanishVoice': 'No hay voces en español instaladas. Añade una en Configuración › Hora e idioma › Voz.',
  'settings.camera': 'Cámara preferida',
  'settings.cameraDefault': 'Predeterminada',
  ```

- [ ] **Step 3: Piezas de plataforma**

`config/env.ts`:
```ts
export const API_URL: string = import.meta.env.RENDERER_VITE_API_URL ?? 'http://localhost:8000';
```
`auth/tokenStorage.ts`:
```ts
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
    await window.senavoz.tokens.save(tokens);
    cache = tokens;
  },

  async clear(): Promise<void> {
    cache = null;
    await window.senavoz.tokens.clear();
  },
};
```
(`save` escribe primero y actualiza la caché después: si el cifrado falla, la sesión no queda "medio guardada".)

`test/fakeSenavoz.ts`:
```ts
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
```
`test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';

import { installFakeSenavoz } from './fakeSenavoz';

installFakeSenavoz();
```

- [ ] **Step 4: Portar los tests del cliente y de la sesión**

`__tests__/client.test.ts` — copiar `mobile/src/__tests__/client.test.ts` con estos cambios:
- Añadir `import { beforeEach, describe, expect, it, vi } from 'vitest';`
- `jest.fn()` → `vi.fn()`.
- Sustituir el `require('@/api/client')` por un import dinámico tras fijar el adaptador:
  ```ts
  const { http, setAuthFailureHandler } = await import('@/api/client');
  ```
  (top-level await está permitido en Vitest).

`__tests__/session.test.ts` — copiar `mobile/src/__tests__/session.test.ts` con:
- Import de `vi` y funciones de vitest.
- `jest.mock('@/api/endpoints', …)` → `vi.mock('@/api/endpoints', () => ({ authApi: { login: vi.fn(), register: vi.fn(), logout: vi.fn() }, usersApi: { me: vi.fn() } }));`
- `jest.clearAllMocks()` → `vi.clearAllMocks()`; `(x as jest.Mock)` → `vi.mocked(x)`.

Añadir al final de `session.test.ts` un caso nuevo (fallo de cifrado al guardar):
```ts
  it('si el almacén seguro falla al guardar, el login falla y no autentica', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ access_token: 'a1', refresh_token: 'r1', token_type: 'bearer', expires_in: 900 });
    const spy = vi.spyOn(window.senavoz.tokens, 'save').mockRejectedValueOnce(new Error('cifrado no disponible'));

    await expect(useSession.getState().login('ana@example.com', 'clave1234')).rejects.toThrow();

    expect(await tokenStorage.getRefreshToken()).toBeNull();
    expect(useSession.getState().status).not.toBe('authenticated');
    spy.mockRestore();
  });
```

- [ ] **Step 5: Ejecutar**

Run: `npm test -- --project renderer` → Expected: PASS (2 del cliente + 8 de sesión + smoke). Si algo falla por diferencias de entorno (jsdom vs RN), corregir el test o el módulo sin cambiar el comportamiento especificado.
Run: `npm run typecheck` → sin errores.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer
git commit -m "feat(desktop): cliente HTTP con refresh, sesión y tokens vía IPC portados del móvil"
```

---

### Task 5: UI base, rutas con guard, login y registro

**Files:**
- Create (en `src/renderer/src/`): `styles.css`, `ui/{Button,FormField,AuthScreen,Splash}.tsx` + `ui/ui.module.css`, `routes/{Guard,AppLayout,Login,Register}.tsx` + `routes/routes.module.css`, `App.tsx`, `__tests__/login.test.tsx`, `__tests__/guard.test.tsx`
- Modify: `main.tsx` (reemplazar)

**Interfaces:**
- Consumes: `useSession`, `loginSchema`, `registerSchema`, `messageForAuthError`, `t`, `queryClient`.
- Produces: `<Button label onClick loading? disabled? variant? ariaLabel?>`, `<FormField control name label type? autoComplete?>`, `<AuthScreen title>`, `<Splash>`; rutas `#/login`, `#/register`, `#/frases`, `#/camara`, `#/ajustes`; `AppLayout` renderiza `<Outlet/>` con la barra lateral. Las pantallas Frases/Cámara/Ajustes se crean en Tasks 7–9; aquí `App.tsx` importa componentes provisionales `routes/Phrases.tsx`, `routes/Camera.tsx`, `routes/Settings.tsx` que devuelven `<h1>` con `t('home.title')`, `t('nav.camera')`, `t('settings.title')`.

- [ ] **Step 1: Test de login (falla)**

`__tests__/login.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Login from '@/routes/Login';
import { useSession } from '@/store/session';

const login = vi.fn();

beforeEach(() => {
  login.mockReset();
  useSession.setState({ login });
});

function setup() {
  render(<MemoryRouter><Login /></MemoryRouter>);
  return userEvent.setup();
}

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
}

describe('pantalla de login', () => {
  it('muestra errores de validación en español y no llama al servidor', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Ingresa tu correo electrónico')).toBeInTheDocument();
    expect(await screen.findByText('Ingresa tu contraseña')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('rechaza un correo con formato inválido', async () => {
    const user = setup();
    await fill(user, 'no-es-correo', 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('El correo electrónico no es válido')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('envía credenciales normalizadas', async () => {
    login.mockResolvedValue(undefined);
    const user = setup();
    await fill(user, '  Ana@Example.com ', 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('ana@example.com', 'clave1234'));
  });

  it('muestra un mensaje claro si las credenciales son incorrectas', async () => {
    login.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    const user = setup();
    await fill(user, 'ana@example.com', 'mala12345');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });

  it('muestra un error de red si el servidor no responde', async () => {
    login.mockRejectedValue({ isAxiosError: true });
    const user = setup();
    await fill(user, 'ana@example.com', 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
  });
});
```
Nota: `isNetworkError` usa `axios.isAxiosError`, que comprueba `payload.isAxiosError === true`; por eso el objeto literal sirve.

Run: `npm test -- --project renderer` → FAIL (no existe `@/routes/Login`).

- [ ] **Step 2: Estilos y componentes UI**

`styles.css` (global, importado en `main.tsx`):
```css
:root {
  --bg: #0b1220;
  --surface: #16213a;
  --card: #ffd60a;
  --card-text: #111827;
  --text: #ffffff;
  --text-muted: #b6c2d9;
  --primary: #4da3ff;
  --primary-text: #04121f;
  --danger: #ff6b6b;
  --border: #3a4a6b;
  color-scheme: dark;
  font-family: 'Segoe UI', system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--text); font-size: 16px; }
:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
button { font: inherit; }
```
`ui/ui.module.css`:
```css
.button { min-height: 48px; padding: 0 20px; border: 0; border-radius: 12px; font-weight: 700; font-size: 17px; cursor: pointer; background: var(--primary); color: var(--primary-text); }
.secondary { background: var(--border); color: var(--text); }
.danger { background: var(--danger); color: var(--primary-text); }
.button:disabled { opacity: 0.6; cursor: default; }
.field { display: flex; flex-direction: column; gap: 6px; }
.label { color: var(--text-muted); font-weight: 600; }
.input { min-height: 48px; padding: 0 14px; border-radius: 12px; border: 2px solid var(--border); background: var(--surface); color: var(--text); font-size: 17px; }
.input[aria-invalid='true'] { border-color: var(--danger); }
.fieldError { color: var(--danger); font-weight: 600; }
.auth { min-height: 100%; display: grid; place-items: center; padding: 24px; }
.authBox { width: min(420px, 100%); display: flex; flex-direction: column; gap: 16px; }
.brand { color: var(--card); font-size: 40px; font-weight: 900; margin: 0; }
.title { font-size: 24px; margin: 0 0 8px; }
.splash { height: 100%; display: grid; place-items: center; color: var(--text-muted); }
```
`ui/Button.tsx`:
```tsx
import styles from './ui.module.css';

type Props = {
  label: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  ariaLabel?: string;
};

export function Button({ label, onClick, type = 'button', loading, disabled, variant = 'primary', ariaLabel }: Props) {
  const cls = [styles.button, variant !== 'primary' && styles[variant]].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled || loading} aria-busy={loading || undefined} aria-label={ariaLabel}>
      {label}
    </button>
  );
}
```
`ui/FormField.tsx`:
```tsx
import { useId } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import styles from './ui.module.css';

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
};

export function FormField<T extends FieldValues>({ control, name, label, type = 'text', autoComplete }: Props<T>) {
  const id = useId();
  const { field, fieldState } = useController({ control, name });
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <input
        id={id}
        className={styles.input}
        type={type}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={fieldState.error ? true : undefined}
        aria-describedby={fieldState.error ? errorId : undefined}
        {...field}
        value={field.value ?? ''}
      />
      {fieldState.error ? <span id={errorId} className={styles.fieldError}>{fieldState.error.message}</span> : null}
    </div>
  );
}
```
`ui/AuthScreen.tsx`:
```tsx
import type { ReactNode } from 'react';

import { t } from '@/i18n';

import styles from './ui.module.css';

export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.auth}>
      <div className={styles.authBox}>
        <p className={styles.brand}>{t('app.name')}</p>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
    </main>
  );
}
```
`ui/Splash.tsx`:
```tsx
import { t } from '@/i18n';

import styles from './ui.module.css';

export function Splash() {
  return <div className={styles.splash} role="status">{t('app.loading')}</div>;
}
```

- [ ] **Step 3: Login y Registro**

`routes/routes.module.css`:
```css
.form { display: flex; flex-direction: column; gap: 16px; }
.error { color: var(--danger); font-weight: 600; margin: 0; }
.link { color: var(--primary); text-align: center; padding: 12px; font-size: 17px; }
.shell { display: grid; grid-template-columns: 220px 1fr; height: 100%; }
.sidebar { background: var(--surface); padding: 24px 12px; display: flex; flex-direction: column; gap: 6px; }
.sidebarBrand { color: var(--card); font-size: 26px; font-weight: 900; padding: 0 12px 16px; margin: 0; }
.navLink { color: var(--text); text-decoration: none; padding: 12px; border-radius: 10px; font-weight: 600; font-size: 17px; }
.navLink[aria-current='page'] { background: var(--border); }
.content { overflow: auto; padding: 28px; }
```
`routes/Login.tsx`:
```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { messageForAuthError } from '@/api/errors';
import { loginSchema, type LoginForm } from '@/auth/schemas';
import { t } from '@/i18n';
import { useSession } from '@/store/session';
import { AuthScreen } from '@/ui/AuthScreen';
import { Button } from '@/ui/Button';
import { FormField } from '@/ui/FormField';

import styles from './routes.module.css';

export default function Login() {
  const login = useSession((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await login(email.trim().toLowerCase(), password);
      // La navegación la resuelve el guard al cambiar el estado de sesión.
    } catch (e) {
      setServerError(messageForAuthError(e, 'login'));
    }
  });

  return (
    <AuthScreen title={t('auth.login.title')}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField control={control} name="email" label={t('auth.email')} type="email" autoComplete="email" />
        <FormField control={control} name="password" label={t('auth.password')} type="password" autoComplete="current-password" />
        {serverError ? <p role="alert" className={styles.error}>{serverError}</p> : null}
        <Button type="submit" label={isSubmitting ? t('auth.loading') : t('auth.login.submit')} ariaLabel={t('auth.login.submit')} loading={isSubmitting} />
      </form>
      <Link to="/register" className={styles.link}>{t('auth.login.toRegister')}</Link>
    </AuthScreen>
  );
}
```
`routes/Register.tsx`:
```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { messageForAuthError } from '@/api/errors';
import { registerSchema, type RegisterForm } from '@/auth/schemas';
import { t } from '@/i18n';
import { useSession } from '@/store/session';
import { AuthScreen } from '@/ui/AuthScreen';
import { Button } from '@/ui/Button';
import { FormField } from '@/ui/FormField';

import styles from './routes.module.css';

export default function Register() {
  const register = useSession((s) => s.register);
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState: { isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ displayName, email, password }) => {
    setServerError(null);
    try {
      await register(email.trim().toLowerCase(), password, displayName.trim());
    } catch (e) {
      setServerError(messageForAuthError(e, 'register'));
    }
  });

  return (
    <AuthScreen title={t('auth.register.title')}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField control={control} name="displayName" label={t('auth.displayName')} autoComplete="name" />
        <FormField control={control} name="email" label={t('auth.email')} type="email" autoComplete="email" />
        <FormField control={control} name="password" label={t('auth.password')} type="password" autoComplete="new-password" />
        {serverError ? <p role="alert" className={styles.error}>{serverError}</p> : null}
        <Button type="submit" label={isSubmitting ? t('auth.loading') : t('auth.register.submit')} ariaLabel={t('auth.register.submit')} loading={isSubmitting} />
      </form>
      <Link to="/login" className={styles.link}>{t('auth.register.toLogin')}</Link>
    </AuthScreen>
  );
}
```
Run: `npm test -- --project renderer` → login tests PASS.

- [ ] **Step 4: Test del guard (falla)**

`__tests__/guard.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { RequireAuth, RequireGuest } from '@/routes/Guard';
import { useSession } from '@/store/session';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireGuest />}><Route path="/login" element={<p>login</p>} /></Route>
        <Route element={<RequireAuth />}><Route path="/frases" element={<p>frases</p>} /></Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => useSession.setState({ status: 'loading', user: null }));

describe('guard de rutas', () => {
  it('muestra el splash mientras se restaura la sesión', () => {
    renderAt('/frases');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  });

  it('sin sesión redirige a login', () => {
    useSession.setState({ status: 'unauthenticated' });
    renderAt('/frases');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('con sesión, login redirige a frases', () => {
    useSession.setState({ status: 'authenticated' });
    renderAt('/login');
    expect(screen.getByText('frases')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Guard, layout, App y main**

`routes/Guard.tsx`:
```tsx
import { Navigate, Outlet } from 'react-router';

import { useSession } from '@/store/session';
import { Splash } from '@/ui/Splash';

export function RequireAuth() {
  const status = useSession((s) => s.status);
  if (status === 'loading') return <Splash />;
  return status === 'authenticated' ? <Outlet /> : <Navigate to="/login" replace />;
}

export function RequireGuest() {
  const status = useSession((s) => s.status);
  if (status === 'loading') return <Splash />;
  return status === 'authenticated' ? <Navigate to="/frases" replace /> : <Outlet />;
}
```
`routes/AppLayout.tsx`:
```tsx
import { NavLink, Outlet } from 'react-router';

import { t } from '@/i18n';

import styles from './routes.module.css';

const links = [
  { to: '/frases', label: 'nav.home' },
  { to: '/camara', label: 'nav.camera' },
  { to: '/ajustes', label: 'nav.settings' },
] as const;

export function AppLayout() {
  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label={t('nav.label')}>
        <p className={styles.sidebarBrand}>{t('app.name')}</p>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={styles.navLink}>{t(l.label)}</NavLink>
        ))}
      </nav>
      <main className={styles.content}><Outlet /></main>
    </div>
  );
}
```
`App.tsx`:
```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';

import { queryClient } from '@/api/queryClient';
import { AppLayout } from '@/routes/AppLayout';
import Camera from '@/routes/Camera';
import { RequireAuth, RequireGuest } from '@/routes/Guard';
import Login from '@/routes/Login';
import Phrases from '@/routes/Phrases';
import Register from '@/routes/Register';
import Settings from '@/routes/Settings';
import { useSession } from '@/store/session';

export function App() {
  useEffect(() => {
    void useSession.getState().restore();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<RequireGuest />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route path="/frases" element={<Phrases />} />
              <Route path="/camara" element={<Camera />} />
              <Route path="/ajustes" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/frases" replace />} />
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  );
}
```
`main.tsx`:
```tsx
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```
Crear los tres provisionales (`routes/Phrases.tsx`, `routes/Camera.tsx`, `routes/Settings.tsx`), p. ej.:
```tsx
import { t } from '@/i18n';

export default function Phrases() {
  return <h1>{t('home.title')}</h1>;
}
```
Si `react-router` 8 renombró alguno de `HashRouter`, `MemoryRouter`, `NavLink`, `Navigate`, `Outlet`, `Link`, `Routes`, `Route`, consultar su guía de migración (context7) y adaptar los imports sin cambiar el comportamiento.

- [ ] **Step 6: Verificar**

Run: `npm test` → PASS. `npm run typecheck` → OK. Con el backend levantado (`docker compose up -d` en la raíz), `npm run dev`: registrarse lleva a la barra lateral; cerrar y reabrir la app sigue autenticado.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer
git commit -m "feat(desktop): login, registro, guard de rutas y layout con barra lateral"
```

---

### Task 6: Ajustes persistentes y servicio de voz

**Files:**
- Create (en `src/renderer/src/`): `store/settings.ts`, `services/speech/{SpeechService,WebSpeechService,CachedAudioSpeechService,useSpanishVoices,index}.ts`, `test/fakeSpeech.ts`, `__tests__/speech.test.ts`, `__tests__/voices.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  useSettings: { volume: number; rate: number; voiceURI: string | null; cameraId: string | null;
                 setVolume(v); setRate(r); setVoiceURI(uri|null); setCameraId(id|null) }
  type VoiceOptions = { volume: number; rate: number; voiceURI: string | null }
  class WebSpeechService implements SpeechService { constructor(getOptions: () => VoiceOptions, synth?: SpeechSynthesis) }
  class CachedAudioSpeechService implements SpeechService { constructor(fallback, getOptions, audioByCode?, createAudio?) }
  useSpanishVoices(synth?: SpeechSynthesis): SpeechSynthesisVoice[]
  speechService: SpeechService
  ```

- [ ] **Step 1: Fakes y tests (fallan)**

`test/fakeSpeech.ts`:
```ts
import { vi } from 'vitest';

export class FakeUtterance {
  lang = '';
  volume = 1;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  constructor(public text: string) {}
}

export function voice(name: string, lang: string, isDefault = false): SpeechSynthesisVoice {
  return { name, lang, voiceURI: `uri:${name}`, default: isDefault, localService: true } as SpeechSynthesisVoice;
}

/** speechSynthesis falso: registra cancel/speak y permite emitir voiceschanged. */
export function fakeSynth(initialVoices: SpeechSynthesisVoice[] = []) {
  let voices = initialVoices;
  const target = new EventTarget();
  const synth = {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => voices,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  };
  return {
    synth: synth as unknown as SpeechSynthesis,
    raw: synth,
    setVoices(next: SpeechSynthesisVoice[]) {
      voices = next;
      target.dispatchEvent(new Event('voiceschanged'));
    },
  };
}

vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
```
`__tests__/speech.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

import { fakeSynth, voice } from '@/test/fakeSpeech';
import { CachedAudioSpeechService } from '@/services/speech/CachedAudioSpeechService';
import { WebSpeechService } from '@/services/speech/WebSpeechService';

const helena = voice('Helena', 'es-ES', true);
const pablo = voice('Pablo', 'es-ES');

describe('WebSpeechService', () => {
  it('cancela lo anterior y habla con voz, volumen y velocidad de ajustes', async () => {
    const { synth, raw } = fakeSynth([helena, pablo]);
    const svc = new WebSpeechService(() => ({ volume: 0.5, rate: 1.25, voiceURI: 'uri:Pablo' }), synth);

    await svc.speak({ code: 'hello', text: 'Hola' });

    expect(raw.cancel).toHaveBeenCalledBefore(raw.speak);
    const u = raw.speak.mock.calls[0][0];
    expect(u).toMatchObject({ text: 'Hola', lang: 'es-ES', volume: 0.5, rate: 1.25 });
    expect(u.voice).toBe(pablo);
  });

  it('si la voz guardada ya no existe, usa la predeterminada (voice = null)', async () => {
    const { synth, raw } = fakeSynth([helena]);
    const svc = new WebSpeechService(() => ({ volume: 1, rate: 1, voiceURI: 'uri:Desinstalada' }), synth);

    await svc.speak('Hola');

    expect(raw.speak.mock.calls[0][0].voice).toBeNull();
  });
});

describe('CachedAudioSpeechService', () => {
  it('sin audio para el código delega en el fallback', async () => {
    const fallback = { speak: vi.fn(async () => {}), stop: vi.fn() };
    const svc = new CachedAudioSpeechService(fallback, () => ({ volume: 1, rate: 1, voiceURI: null }));
    await svc.speak({ code: 'yes', text: 'Sí' });
    expect(fallback.speak).toHaveBeenCalledWith({ code: 'yes', text: 'Sí' });
  });

  it('con audio para el código lo reproduce con el volumen de ajustes', async () => {
    const fallback = { speak: vi.fn(async () => {}), stop: vi.fn() };
    const audio = { volume: 1, play: vi.fn(async () => {}), pause: vi.fn() };
    const svc = new CachedAudioSpeechService(
      fallback,
      () => ({ volume: 0.3, rate: 1, voiceURI: null }),
      { yes: 'blob:yes' },
      () => audio as unknown as HTMLAudioElement,
    );
    await svc.speak({ code: 'yes', text: 'Sí' });
    expect(audio.play).toHaveBeenCalled();
    expect(audio.volume).toBe(0.3);
    expect(fallback.speak).not.toHaveBeenCalled();
  });
});
```
Nota: `toHaveBeenCalledBefore` existe en Vitest ≥ 3; si no, comparar `mock.invocationCallOrder`.

`__tests__/voices.test.tsx`:
```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSpanishVoices } from '@/services/speech/useSpanishVoices';
import { fakeSynth, voice } from '@/test/fakeSpeech';

describe('useSpanishVoices', () => {
  it('se rellena cuando llegan las voces (voiceschanged) y filtra a es-*', () => {
    const fake = fakeSynth([]);
    const { result } = renderHook(() => useSpanishVoices(fake.synth));
    expect(result.current).toEqual([]);

    act(() => fake.setVoices([voice('Helena', 'es-ES'), voice('Zira', 'en-US'), voice('Sabina', 'es-MX')]));

    expect(result.current.map((v) => v.name)).toEqual(['Helena', 'Sabina']);
  });
});
```
Run: `npm test -- --project renderer` → FAIL (módulos inexistentes).

- [ ] **Step 2: Store de ajustes**

`store/settings.ts`:
```ts
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type SettingsState = {
  /** 0..1 */
  volume: number;
  /** Velocidad de habla; 1 = normal. */
  rate: number;
  /** voiceURI de la voz elegida; null = predeterminada del sistema. */
  voiceURI: string | null;
  /** deviceId de la webcam preferida; null = predeterminada. */
  cameraId: string | null;
  setVolume: (v: number) => void;
  setRate: (r: number) => void;
  setVoiceURI: (uri: string | null) => void;
  setCameraId: (id: string | null) => void;
};

// Preferencias no sensibles: localStorage es apropiado (los tokens NO van aquí).
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      volume: 1,
      rate: 1,
      voiceURI: null,
      cameraId: null,
      setVolume: (volume) => set({ volume }),
      setRate: (rate) => set({ rate }),
      setVoiceURI: (voiceURI) => set({ voiceURI }),
      setCameraId: (cameraId) => set({ cameraId }),
    }),
    { name: 'senavoz.settings', storage: createJSONStorage(() => localStorage) },
  ),
);
```

- [ ] **Step 3: Servicios de voz**

Copiar `mobile/src/services/speech/SpeechService.ts` tal cual.

`services/speech/WebSpeechService.ts`:
```ts
import type { SpeakablePhrase, SpeechService } from './SpeechService';

export type VoiceOptions = { volume: number; rate: number; voiceURI: string | null };

/** TTS del sistema (Web Speech API). Es la implementación base y el fallback. */
export class WebSpeechService implements SpeechService {
  constructor(
    private readonly getOptions: () => VoiceOptions,
    private readonly synth: SpeechSynthesis = window.speechSynthesis,
  ) {}

  async speak(target: SpeakablePhrase | string): Promise<void> {
    const text = typeof target === 'string' ? target : target.text;
    const { volume, rate, voiceURI } = this.getOptions();
    // Cancela lo que esté sonando para que clics rápidos no se encolen.
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.volume = volume;
    utterance.rate = rate;
    // Si la voz guardada ya no está instalada, null = predeterminada del sistema.
    utterance.voice = this.synth.getVoices().find((v) => v.voiceURI === voiceURI) ?? null;
    this.synth.speak(utterance);
  }

  stop(): void {
    this.synth.cancel();
  }
}
```
`services/speech/CachedAudioSpeechService.ts`:
```ts
import type { SpeakablePhrase, SpeechService } from './SpeechService';
import type { VoiceOptions } from './WebSpeechService';

/**
 * Espacio para la fase de TTS pregenerado/cacheado (ver docs/ARCHITECTURE.md).
 *
 * Reproduce un audio local por `phrase.code` si existe en `audioByCode`; si no,
 * delega en `fallback` (TTS del sistema). Hoy nadie le pasa audios, así que se
 * comporta como el fallback. En la Fase 4 este servicio es el que podrá enviar
 * el audio al cable virtual con `setSinkId`.
 */
export class CachedAudioSpeechService implements SpeechService {
  private audio: HTMLAudioElement | null = null;

  constructor(
    private readonly fallback: SpeechService,
    private readonly getOptions: () => VoiceOptions,
    private readonly audioByCode: Record<string, string> = {},
    private readonly createAudio: (src: string) => HTMLAudioElement = (src) => new Audio(src),
  ) {}

  async speak(target: SpeakablePhrase | string): Promise<void> {
    const src = typeof target === 'string' ? undefined : this.audioByCode[target.code];
    if (!src) return this.fallback.speak(target);

    this.audio?.pause();
    const audio = this.createAudio(src);
    audio.volume = this.getOptions().volume;
    this.audio = audio;
    await audio.play();
  }

  stop(): void {
    this.audio?.pause();
    this.fallback.stop();
  }
}
```
`services/speech/useSpanishVoices.ts`:
```ts
import { useEffect, useState } from 'react';

const spanish = (synth: SpeechSynthesis) => synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));

/** Voces en español instaladas; se actualiza cuando el sistema termina de cargarlas. */
export function useSpanishVoices(synth: SpeechSynthesis = window.speechSynthesis): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(() => spanish(synth));
  useEffect(() => {
    const update = () => setVoices(spanish(synth));
    synth.addEventListener('voiceschanged', update);
    update();
    return () => synth.removeEventListener('voiceschanged', update);
  }, [synth]);
  return voices;
}
```
`services/speech/index.ts`:
```ts
import { useSettings } from '@/store/settings';

import type { SpeechService } from './SpeechService';
import { WebSpeechService } from './WebSpeechService';

export type { SpeakablePhrase, SpeechService } from './SpeechService';

const voiceOptions = () => {
  const { volume, rate, voiceURI } = useSettings.getState();
  return { volume, rate, voiceURI };
};

/**
 * Punto único donde se elige la implementación. Para activar audios cacheados,
 * envolver aquí con `new CachedAudioSpeechService(base, voiceOptions, audios)`.
 */
export const speechService: SpeechService = new WebSpeechService(voiceOptions);
```
Ojo: `new WebSpeechService(voiceOptions)` evalúa `window.speechSynthesis` al importar. En jsdom no existe; los tests que importen `@/services/speech` deben mockearlo (`vi.mock('@/services/speech', …)`), como se hace en Tasks 7–9.

- [ ] **Step 4: Ejecutar**

Run: `npm test -- --project renderer` → PASS. `npm run typecheck` → OK.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer
git commit -m "feat(desktop): voz con Web Speech API, selección de voz y ajustes persistentes"
```

---

### Task 7: Pantalla de frases con atajos 1–9

**Files:**
- Create (en `src/renderer/src/`): `hooks/usePhraseShortcuts.ts`, `ui/PhraseCard.tsx`, `__tests__/shortcuts.test.tsx`, `__tests__/phrases.test.tsx`
- Modify: `routes/Phrases.tsx` (reemplazar el provisional), `routes/routes.module.css` (añadir clases)

**Interfaces:**
- Consumes: `usePhrases`, `speechService`, `Phrase`, `t`, `Button`.
- Produces: `usePhraseShortcuts(phrases: Phrase[] | undefined, onPhrase: (p: Phrase) => void): void`; `<PhraseCard text shortcut? onClick>`.

- [ ] **Step 1: Tests de atajos (fallan)**

`__tests__/shortcuts.test.tsx`:
```tsx
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Phrase } from '@/api/types';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';

const phrases: Phrase[] = ['hello', 'yes', 'no'].map((code, i) => ({ id: String(i), code, text_es: code, is_default: true }));

function Harness({ onPhrase }: { onPhrase: (p: Phrase) => void }) {
  usePhraseShortcuts(phrases, onPhrase);
  return <input aria-label="campo" />;
}

describe('atajos 1–9', () => {
  it('la tecla N reproduce la frase N', async () => {
    const onPhrase = vi.fn();
    render(<Harness onPhrase={onPhrase} />);
    await userEvent.keyboard('2');
    expect(onPhrase).toHaveBeenCalledWith(phrases[1]);
  });

  it('una tecla sin frase no hace nada', async () => {
    const onPhrase = vi.fn();
    render(<Harness onPhrase={onPhrase} />);
    await userEvent.keyboard('9');
    expect(onPhrase).not.toHaveBeenCalled();
  });

  it('se ignora al escribir en un campo de texto', async () => {
    const onPhrase = vi.fn();
    const { getByLabelText } = render(<Harness onPhrase={onPhrase} />);
    await userEvent.type(getByLabelText('campo'), '1');
    expect(onPhrase).not.toHaveBeenCalled();
  });

  it('se ignora con modificadores (Ctrl/Alt/Meta) y con autorrepetición', async () => {
    const onPhrase = vi.fn();
    render(<Harness onPhrase={onPhrase} />);
    await userEvent.keyboard('{Control>}1{/Control}{Alt>}1{/Alt}{Meta>}1{/Meta}');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', repeat: true }));
    expect(onPhrase).not.toHaveBeenCalled();
  });
});
```
Run → FAIL.

- [ ] **Step 2: Hook**

`hooks/usePhraseShortcuts.ts`:
```ts
import { useEffect, useRef } from 'react';

import type { Phrase } from '@/api/types';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Teclas 1–9 reproducen las nueve primeras frases (útil durante una reunión). */
export function usePhraseShortcuts(phrases: Phrase[] | undefined, onPhrase: (p: Phrase) => void): void {
  // Refs para no re-suscribir el listener en cada render.
  const latest = useRef({ phrases, onPhrase });
  latest.current = { phrases, onPhrase };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const phrase = latest.current.phrases?.[Number(e.key) - 1];
      if (!phrase) return;
      e.preventDefault();
      latest.current.onPhrase(phrase);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
```
Run → shortcuts PASS.

- [ ] **Step 3: Test de la pantalla (falla)**

`__tests__/phrases.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Phrases from '@/routes/Phrases';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({ speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() } }));
const list = vi.fn();
vi.mock('@/api/endpoints', () => ({ phrasesApi: { list: () => list() } }));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Phrases /></QueryClientProvider>);
}

beforeEach(() => {
  speak.mockReset();
  list.mockReset();
});

describe('pantalla de frases', () => {
  it('clic en una tarjeta reproduce la frase', async () => {
    list.mockResolvedValue([{ id: '1', code: 'hello', text_es: 'Hola', is_default: true }]);
    renderScreen();
    await userEvent.click(await screen.findByRole('button', { name: 'Reproducir en voz alta: Hola' }));
    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
  });

  it('si falla la carga muestra error y permite reintentar', async () => {
    list.mockRejectedValueOnce(new Error('red')).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('No se pudieron cargar las frases')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(list).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 4: Tarjeta y pantalla**

Añadir a `routes/routes.module.css`:
```css
.title { font-size: 28px; margin: 0; }
.hint { color: var(--text-muted); margin: 6px 0 20px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
.center { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 40px; }
.errorText { color: var(--danger); font-size: 18px; }
```
Añadir a `ui/ui.module.css`:
```css
.card { position: relative; min-height: 130px; padding: 16px; border: 0; border-radius: 18px; background: var(--card); color: var(--card-text); font-size: 24px; font-weight: 800; cursor: pointer; }
.card:active { transform: scale(0.97); opacity: 0.8; }
.shortcut { position: absolute; top: 8px; left: 12px; font-size: 14px; font-weight: 700; opacity: 0.6; }
```
`ui/PhraseCard.tsx`:
```tsx
import { t } from '@/i18n';

import styles from './ui.module.css';

type Props = { text: string; shortcut?: number; onClick: () => void };

export function PhraseCard({ text, shortcut, onClick }: Props) {
  return (
    <button type="button" className={styles.card} onClick={onClick} aria-label={t('home.speakA11y', { text })} aria-keyshortcuts={shortcut ? String(shortcut) : undefined}>
      {shortcut ? <span className={styles.shortcut} aria-hidden>{shortcut}</span> : null}
      {text}
    </button>
  );
}
```
(Un `<button>` nativo ya responde a Enter/Espacio.)

`routes/Phrases.tsx`:
```tsx
import type { Phrase } from '@/api/types';
import { usePhrases } from '@/api/usePhrases';
import { usePhraseShortcuts } from '@/hooks/usePhraseShortcuts';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { Button } from '@/ui/Button';
import { PhraseCard } from '@/ui/PhraseCard';

import styles from './routes.module.css';

const speak = (p: Phrase) => void speechService.speak({ code: p.code, text: p.text_es });

export default function Phrases() {
  const { data, isPending, isError, refetch, isRefetching } = usePhrases();
  usePhraseShortcuts(data, speak);

  return (
    <>
      <h1 className={styles.title}>{t('home.title')}</h1>
      <p className={styles.hint}>{t('home.hint')}</p>
      {isPending ? (
        <div className={styles.center} role="status">{t('home.loading')}</div>
      ) : isError ? (
        <div className={styles.center}>
          <p className={styles.errorText}>{t('home.error')}</p>
          <Button label={t('home.retry')} loading={isRefetching} onClick={() => void refetch()} />
        </div>
      ) : (
        <div className={styles.grid}>
          {data.map((p, i) => (
            <PhraseCard key={p.code} text={p.text_es} shortcut={i < 9 ? i + 1 : undefined} onClick={() => speak(p)} />
          ))}
        </div>
      )}
    </>
  );
}
```
Run: `npm test -- --project renderer` → PASS. `npm run typecheck` → OK.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer
git commit -m "feat(desktop): pantalla de frases con voz y atajos 1–9"
```

---

### Task 8: Cámara con reconocedor simulado

**Files:**
- Create (en `src/renderer/src/`): `services/camera/camera.ts`, `__tests__/camera.test.ts`, `__tests__/cameraScreen.test.tsx`
- Copy: `mobile/src/services/recognition/{SignRecognizer,MockSignRecognizer}.ts` → `services/recognition/`
- Modify: `routes/Camera.tsx` (reemplazar), `routes/routes.module.css`

**Interfaces:**
- Consumes: `useSettings.cameraId`, `usePhrases`, `speechService`, `MockSignRecognizer`.
- Produces:
  ```ts
  type CameraErrorKey = 'camera.permissionDenied' | 'camera.noCamera' | 'camera.inUse' | 'camera.error';
  cameraErrorKey(error: unknown): CameraErrorKey
  openCamera(preferredId: string | null, media?: Pick<MediaDevices,'getUserMedia'>): Promise<MediaStream>
  listCameras(media?: Pick<MediaDevices,'enumerateDevices'>): Promise<{ id: string; label: string }[]>
  ```

- [ ] **Step 1: Tests de la lógica de cámara (fallan)**

`__tests__/camera.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

import { cameraErrorKey, listCameras, openCamera } from '@/services/camera/camera';

const domError = (name: string) => Object.assign(new Error(name), { name });
const stream = {} as MediaStream;

describe('cameraErrorKey', () => {
  it.each([
    ['NotAllowedError', 'camera.permissionDenied'],
    ['SecurityError', 'camera.permissionDenied'],
    ['NotFoundError', 'camera.noCamera'],
    ['OverconstrainedError', 'camera.noCamera'],
    ['NotReadableError', 'camera.inUse'],
    ['AbortError', 'camera.error'],
  ])('%s → %s', (name, key) => {
    expect(cameraErrorKey(domError(name))).toBe(key);
  });

  it('errores desconocidos → genérico', () => {
    expect(cameraErrorKey('x')).toBe('camera.error');
  });
});

describe('openCamera', () => {
  it('pide la cámara preferida exacta', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    await openCamera('cam-2', { getUserMedia });
    expect(getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: 'cam-2' } }, audio: false });
  });

  it.each(['OverconstrainedError', 'NotFoundError'])(
    'si la preferida ya no existe (%s) cae a la predeterminada',
    async (name) => {
      const getUserMedia = vi.fn().mockRejectedValueOnce(domError(name)).mockResolvedValueOnce(stream);
      await expect(openCamera('desenchufada', { getUserMedia })).resolves.toBe(stream);
      expect(getUserMedia).toHaveBeenLastCalledWith({ video: true, audio: false });
    },
  );

  it('no reintenta si el error es de permiso o de cámara en uso', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(domError('NotReadableError'));
    await expect(openCamera('cam-1', { getUserMedia })).rejects.toMatchObject({ name: 'NotReadableError' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('sin preferida pide la predeterminada', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    await openCamera(null, { getUserMedia });
    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });
});

describe('listCameras', () => {
  it('devuelve solo entradas de vídeo, con etiqueta de respaldo', async () => {
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'a', label: 'Integrated Webcam' },
      { kind: 'audioinput', deviceId: 'm', label: 'Mic' },
      { kind: 'videoinput', deviceId: 'b', label: '' },
    ]);
    expect(await listCameras({ enumerateDevices })).toEqual([
      { id: 'a', label: 'Integrated Webcam' },
      { id: 'b', label: 'Cámara 2' },
    ]);
  });
});
```
Run → FAIL.

- [ ] **Step 2: Implementación**

`services/camera/camera.ts`:
```ts
export type CameraErrorKey = 'camera.permissionDenied' | 'camera.noCamera' | 'camera.inUse' | 'camera.error';

const errorName = (e: unknown) => (e instanceof Error || (typeof e === 'object' && e !== null) ? (e as { name?: string }).name : undefined);

/** Traduce los errores de getUserMedia a un mensaje claro. */
export function cameraErrorKey(error: unknown): CameraErrorKey {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'camera.permissionDenied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'camera.noCamera';
    case 'NotReadableError':
      return 'camera.inUse';
    default:
      return 'camera.error';
  }
}

type Media = Pick<MediaDevices, 'getUserMedia'>;

/**
 * Abre la webcam preferida; si ya no existe (desenchufada), cae a la
 * predeterminada. Los errores de permiso o de cámara en uso se propagan.
 */
export async function openCamera(preferredId: string | null, media: Media = navigator.mediaDevices): Promise<MediaStream> {
  if (preferredId) {
    try {
      return await media.getUserMedia({ video: { deviceId: { exact: preferredId } }, audio: false });
    } catch (e) {
      if (cameraErrorKey(e) !== 'camera.noCamera') throw e;
    }
  }
  return media.getUserMedia({ video: true, audio: false });
}

export async function listCameras(
  media: Pick<MediaDevices, 'enumerateDevices'> = navigator.mediaDevices,
): Promise<{ id: string; label: string }[]> {
  const devices = await media.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Cámara ${i + 1}` }));
}
```
Run → camera.test PASS.

- [ ] **Step 3: Test de la pantalla (falla)**

`__tests__/cameraScreen.test.tsx`:
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Camera from '@/routes/Camera';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({ speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() } }));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: { list: async () => [{ id: '1', code: 'hello', text_es: 'Hola', is_default: true }] },
}));
const openCamera = vi.fn();
vi.mock('@/services/camera/camera', async (orig) => ({
  ...(await orig<typeof import('@/services/camera/camera')>()),
  openCamera: (...a: unknown[]) => openCamera(...a),
  listCameras: async () => [],
}));

const stop = vi.fn();
const fakeStream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Camera /></QueryClientProvider>);
}

beforeEach(() => {
  speak.mockReset();
  stop.mockReset();
  openCamera.mockReset();
});

describe('pantalla de cámara', () => {
  it('muestra el aviso y la simulación reproduce la frase', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Reconocimiento de señas: próximamente')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Simular seña: Hola' }));

    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
    expect(screen.getByText('Seña detectada: Hola')).toBeInTheDocument();
  });

  it('cámara en uso → mensaje específico y reintento', async () => {
    openCamera.mockRejectedValueOnce(Object.assign(new Error(), { name: 'NotReadableError' })).mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByRole('alert')).toHaveTextContent('La cámara está en uso por otra aplicación');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(openCamera).toHaveBeenCalledTimes(2);
  });

  it('al salir de la pantalla apaga la cámara', async () => {
    openCamera.mockResolvedValue(fakeStream);
    const { unmount } = renderScreen();
    await screen.findByText('Reconocimiento de señas: próximamente');
    await vi.waitFor(() => expect(openCamera).toHaveBeenCalled());
    unmount();
    await vi.waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
```
Nota: jsdom no implementa `HTMLMediaElement.srcObject` completamente; asignar `video.srcObject` es seguro, pero `play()` no existe → envolver `video.play?.()` en try/catch en la implementación.

- [ ] **Step 4: Pantalla**

Añadir a `routes/routes.module.css`:
```css
.cameraWrap { position: relative; height: calc(100vh - 56px); border-radius: 18px; overflow: hidden; background: #000; }
.video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.overlay { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 16px; pointer-events: none; }
.overlay > * { pointer-events: auto; }
.banner { align-self: center; background: rgba(11, 18, 32, 0.85); border-radius: 14px; padding: 12px 18px; color: var(--card); font-size: 18px; font-weight: 800; }
.bottom { display: flex; flex-direction: column; gap: 12px; }
.detected { background: var(--card); color: var(--card-text); font-size: 20px; font-weight: 800; text-align: center; padding: 12px; border-radius: 12px; margin: 0; }
.debug { background: rgba(11, 18, 32, 0.85); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.debugTitle { color: var(--text-muted); font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 0; }
.select { min-height: 44px; border-radius: 10px; background: var(--surface); color: var(--text); border: 2px solid var(--border); padding: 0 10px; font-size: 16px; }
```
`routes/Camera.tsx`:
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePhrases } from '@/api/usePhrases';
import { t } from '@/i18n';
import { cameraErrorKey, listCameras, openCamera, type CameraErrorKey } from '@/services/camera/camera';
import { MockSignRecognizer } from '@/services/recognition/MockSignRecognizer';
import type { SignRecognizer } from '@/services/recognition/SignRecognizer';
import { speechService } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

type CamState = { kind: 'starting' } | { kind: 'ready' } | { kind: 'error'; key: CameraErrorKey };

export default function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraId = useSettings((s) => s.cameraId);
  const setCameraId = useSettings((s) => s.setCameraId);
  const { data: phrases } = usePhrases();
  const [cam, setCam] = useState<CamState>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [lastSign, setLastSign] = useState<string | null>(null);
  const [debugIndex, setDebugIndex] = useState(0);

  // Fase 3: sustituir por el reconocedor real. El resto de la pantalla solo
  // conoce la interfaz SignRecognizer.
  const recognizer = useMemo(() => new MockSignRecognizer(), []);
  const recognizerApi: SignRecognizer = recognizer;

  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setCam({ kind: 'starting' });
    openCamera(cameraId)
      .then(async (s) => {
        if (cancelled) return s.getTracks().forEach((tr) => tr.stop());
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          try {
            await video.play?.();
          } catch {
            // jsdom / autoplay: el vídeo arranca igualmente con autoPlay.
          }
        }
        setCam({ kind: 'ready' });
        // Con el permiso concedido, las etiquetas de los dispositivos ya son legibles.
        setCameras(await listCameras());
      })
      .catch((e: unknown) => {
        if (!cancelled) setCam({ kind: 'error', key: cameraErrorKey(e) });
      });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [cameraId, attempt]);

  useEffect(() => {
    const off = recognizerApi.onSign(({ code }) => {
      const phrase = phrasesRef.current?.find((p) => p.code === code);
      if (!phrase) return;
      setLastSign(phrase.text_es);
      void speechService.speak({ code: phrase.code, text: phrase.text_es });
    });
    void recognizerApi.start();
    return () => {
      off();
      recognizerApi.stop();
    };
  }, [recognizerApi]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const next = phrases && phrases.length > 0 ? phrases[debugIndex % phrases.length] : undefined;

  return (
    <div className={styles.cameraWrap}>
      <video ref={videoRef} className={styles.video} autoPlay muted playsInline />
      <div className={styles.overlay}>
        <div className={styles.banner}>
          {cam.kind === 'error' ? (
            <div role="alert">
              <p>{t(cam.key)}</p>
              <Button label={t('camera.retry')} onClick={retry} />
            </div>
          ) : cam.kind === 'starting' ? (
            <span role="status">{t('camera.starting')}</span>
          ) : (
            t('camera.comingSoon')
          )}
        </div>

        <div className={styles.bottom}>
          {lastSign ? <p className={styles.detected}>{t('camera.signDetected', { text: lastSign })}</p> : null}
          {cameras.length > 1 ? (
            <label className={styles.debug}>
              <span className={styles.debugTitle}>{t('camera.select')}</span>
              <select className={styles.select} value={cameraId ?? ''} onChange={(e) => setCameraId(e.target.value || null)}>
                <option value="">{t('settings.cameraDefault')}</option>
                {cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          ) : null}
          {next ? (
            <div className={styles.debug}>
              <p className={styles.debugTitle}>{t('camera.debugTitle')}</p>
              <Button
                variant="secondary"
                label={t('camera.debugSimulate', { text: next.text_es })}
                onClick={() => {
                  recognizer.simulate(next.code);
                  setDebugIndex((i) => i + 1);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```
Nota sobre el banner: el texto "Reconocimiento de señas: próximamente" solo aparece con la cámara lista; el primer test lo espera tras `openCamera` resuelto. Si el orden de estados complica el test, ajustar el test para esperar con `findByText` (ya lo hace), no cambiar el comportamiento.

Run: `npm test -- --project renderer` → PASS. `npm run typecheck` → OK.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer
git commit -m "feat(desktop): cámara con webcam, errores claros, selector y reconocedor simulado"
```

---

### Task 9: Pantalla de ajustes

**Files:**
- Create (en `src/renderer/src/`): `__tests__/settings.test.tsx`
- Modify: `routes/Settings.tsx` (reemplazar), `routes/routes.module.css`

**Interfaces:**
- Consumes: `useSession` (user, logout), `useSettings`, `useSpanishVoices`, `listCameras`, `speechService`, `queryClient`, `t`, `Button`.

- [ ] **Step 1: Test (falla)**

`__tests__/settings.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Settings from '@/routes/Settings';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { voice } from '@/test/fakeSpeech';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({ speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() } }));
let voices: SpeechSynthesisVoice[] = [];
vi.mock('@/services/speech/useSpanishVoices', () => ({ useSpanishVoices: () => voices }));
vi.mock('@/services/camera/camera', () => ({ listCameras: async () => [] }));

const logout = vi.fn(async () => {});

beforeEach(() => {
  voices = [voice('Helena', 'es-ES', true), voice('Pablo', 'es-ES')];
  logout.mockClear();
  useSettings.setState({ volume: 1, rate: 1, voiceURI: null, cameraId: null });
  useSession.setState({
    status: 'authenticated',
    user: { id: '1', email: 'ana@example.com', display_name: 'Ana', is_active: true, created_at: '' },
    logout,
  });
});

describe('ajustes', () => {
  it('muestra el perfil', () => {
    render(<Settings />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
  });

  it('volumen y velocidad se ajustan y guardan', async () => {
    render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Volumen -' }));
    await userEvent.click(screen.getByRole('button', { name: 'Velocidad +' }));
    expect(useSettings.getState()).toMatchObject({ volume: 0.9, rate: 1.25 });
  });

  it('elegir una voz la guarda', async () => {
    render(<Settings />);
    await userEvent.selectOptions(screen.getByLabelText('Voz del sistema'), 'uri:Pablo');
    expect(useSettings.getState().voiceURI).toBe('uri:Pablo');
  });

  it('sin voces en español lo avisa', () => {
    voices = [];
    render(<Settings />);
    expect(screen.getByText(/No hay voces en español instaladas/)).toBeInTheDocument();
  });

  it('cerrar sesión llama a logout', async () => {
    render(<Settings />);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(logout).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implementación**

Añadir a `routes/routes.module.css`:
```css
.section { background: var(--surface); border-radius: 16px; padding: 18px; display: flex; flex-direction: column; gap: 14px; max-width: 640px; }
.sectionTitle { color: var(--text-muted); font-size: 13px; font-weight: 700; text-transform: uppercase; margin: 0; }
.name { font-size: 22px; font-weight: 700; margin: 0; }
.muted { color: var(--text-muted); margin: 0; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.stepper { display: flex; align-items: center; gap: 8px; }
.stepBtn { width: 48px; height: 48px; border-radius: 12px; border: 0; background: var(--border); color: var(--text); font-size: 26px; font-weight: 700; cursor: pointer; }
.value { min-width: 64px; text-align: center; font-size: 18px; }
.stack { display: flex; flex-direction: column; gap: 20px; }
```
`routes/Settings.tsx`:
```tsx
import { useEffect, useId, useState } from 'react';

import { queryClient } from '@/api/queryClient';
import { t } from '@/i18n';
import { listCameras } from '@/services/camera/camera';
import { speechService } from '@/services/speech';
import { useSpanishVoices } from '@/services/speech/useSpanishVoices';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 100) / 100;

function Stepper({ label, value, display, onChange, step, min, max }: {
  label: string; value: number; display: string; onChange: (v: number) => void; step: number; min: number; max: number;
}) {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <div className={styles.stepper}>
        <button type="button" className={styles.stepBtn} aria-label={`${label} -`} onClick={() => onChange(round(clamp(value - step, min, max)))}>−</button>
        <output className={styles.value} aria-label={`${label}: ${display}`}>{display}</output>
        <button type="button" className={styles.stepBtn} aria-label={`${label} +`} onClick={() => onChange(round(clamp(value + step, min, max)))}>+</button>
      </div>
    </div>
  );
}

export default function Settings() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const { volume, rate, voiceURI, cameraId, setVolume, setRate, setVoiceURI, setCameraId } = useSettings();
  const voices = useSpanishVoices();
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const voiceId = useId();
  const cameraSelectId = useId();

  useEffect(() => {
    listCameras().then(setCameras, () => setCameras([]));
  }, []);

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    queryClient.clear();
  };

  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>{t('settings.title')}</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.profile')}</h2>
        <p className={styles.name}>{user?.display_name}</p>
        <p className={styles.muted}>{user?.email}</p>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('settings.voice')}</h2>
        <div className={styles.row}>
          <label htmlFor={voiceId}>{t('settings.voiceName')}</label>
          <select id={voiceId} className={styles.select} value={voiceURI ?? ''} onChange={(e) => setVoiceURI(e.target.value || null)}>
            <option value="">{t('settings.voiceDefault')}</option>
            {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{`${v.name} (${v.lang})`}</option>)}
          </select>
        </div>
        {voices.length === 0 ? <p className={styles.muted}>{t('settings.noSpanishVoice')}</p> : null}
        <Stepper label={t('settings.volume')} value={volume} display={`${Math.round(volume * 100)}%`} onChange={setVolume} step={0.1} min={0} max={1} />
        <Stepper label={t('settings.rate')} value={rate} display={`${rate.toFixed(2)}×`} onChange={setRate} step={0.25} min={0.5} max={2} />
        <Button variant="secondary" label={t('settings.test')} onClick={() => void speechService.speak(t('settings.testPhrase'))} />
      </section>

      {cameras.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.row}>
            <label htmlFor={cameraSelectId}>{t('settings.camera')}</label>
            <select id={cameraSelectId} className={styles.select} value={cameraId ?? ''} onChange={(e) => setCameraId(e.target.value || null)}>
              <option value="">{t('settings.cameraDefault')}</option>
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </section>
      ) : null}

      <div style={{ maxWidth: 640 }}>
        <Button
          variant="danger"
          label={loggingOut ? t('settings.loggingOut') : t('settings.logout')}
          ariaLabel={t('settings.logout')}
          loading={loggingOut}
          onClick={() => void onLogout()}
        />
      </div>
    </div>
  );
}
```
(Las etiquetas de cámara solo son legibles tras conceder el permiso; si aún no se ha abierto la cámara, `listCameras` puede devolver etiquetas vacías → "Cámara N". Es aceptable.)

Run: `npm test -- --project renderer` → PASS. `npm run typecheck` → OK.

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer
git commit -m "feat(desktop): ajustes con voz del sistema, cámara preferida y cierre de sesión"
```

---

### Task 10: Backend — CORS para la app de escritorio

**Files:**
- Create: `backend/tests/test_cors.py`
- Modify: `backend/.env.example:8`, `docker-compose.yml` (servicio `api`, `environment`)

**Interfaces:**
- Consumes: `app.main.create_app`, `app.core.config.get_settings`.

- [ ] **Step 1: Test (falla)**

`backend/tests/test_cors.py`:
```python
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture()
def cors_client(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,app://senavoz")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            yield c
    finally:
        get_settings.cache_clear()


def _preflight(client, origin):
    return client.options(
        "/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )


@pytest.mark.parametrize("origin", ["app://senavoz", "http://localhost:5173"])
def test_preflight_permite_origenes_de_escritorio(cors_client, origin):
    r = _preflight(cors_client, origin)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin


def test_preflight_rechaza_origen_no_listado(cors_client):
    r = _preflight(cors_client, "https://evil.example")
    assert "access-control-allow-origin" not in r.headers
```
Run: `cd backend && .venv/Scripts/python -m pytest tests/test_cors.py -v`
Expected: los tests del origen permitido PASAN ya (el mecanismo existe); este test fija el contrato. Si alguno falla, investigar (p. ej. que `app://` no se trate como origen válido) antes de seguir.

- [ ] **Step 2: Configuración**

`backend/.env.example`, línea 8:
```
CORS_ORIGINS=http://localhost:5173,app://senavoz
```
`docker-compose.yml`, servicio `api` → `environment`, añadir:
```yaml
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5173,app://senavoz}
```

- [ ] **Step 3: Suite completa y verificación con Docker**

Run: `cd backend && .venv/Scripts/python -m pytest` → Expected: 22 PASS (19 + 3).
Run: `docker compose up --build -d` y
```bash
curl -s -i -X OPTIONS http://localhost:8000/auth/login -H "Origin: app://senavoz" -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
```
Expected: `access-control-allow-origin: app://senavoz`.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_cors.py backend/.env.example docker-compose.yml
git commit -m "feat(backend): CORS para la app de escritorio (app://senavoz y Vite dev)"
```

---

### Task 11: Empaquetado para Windows

**Files:**
- Create: `desktop/resources/icon.png` (copiar de `mobile/assets/images/icon.png`)
- Modify: `desktop/electron-builder.yml` (reemplazar), `desktop/package.json` (`name`, `productName`, `description`, scripts)

- [ ] **Step 1: Configuración**

```bash
mkdir -p desktop/resources && cp mobile/assets/images/icon.png desktop/resources/icon.png
```
`desktop/electron-builder.yml`:
```yaml
appId: com.senavoz.app
productName: SeñaVoz
directories:
  buildResources: resources
  output: release
files:
  - out/**
  - package.json
win:
  target: nsis
  icon: resources/icon.png
  executableName: SenaVoz
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  artifactName: SenaVoz-Setup-${version}.${ext}
  shortcutName: SeñaVoz
```
En `package.json`: `"name": "senavoz-desktop"`, `"productName": "SeñaVoz"`, `"version": "0.1.0"`, y el script
```json
"build:win": "npm run typecheck && electron-vite build && electron-builder --win"
```
(eliminar scripts `build:mac`/`build:linux` del scaffold y su config si los hubiera).

- [ ] **Step 2: Build y prueba del ejecutable**

Con `desktop/.env` presente (copia de `.env.example`):
Run: `npm run build:win` → Expected: `desktop/release/SenaVoz-Setup-0.1.0.exe` y `desktop/release/win-unpacked/SenaVoz.exe`.
Ejecutar `release/win-unpacked/SenaVoz.exe` con el backend levantado: la app carga bajo `app://senavoz`, se puede iniciar sesión (confirma que CORS y CSP son correctos) y ver frases. Si la ventana queda en blanco, revisar con DevTools (`Ctrl+Shift+I` no está disponible en producción: temporalmente llamar a `win.webContents.openDevTools()` para diagnosticar y quitarlo después).

- [ ] **Step 3: Commit**

```bash
git add desktop/electron-builder.yml desktop/package.json desktop/package-lock.json desktop/resources
git commit -m "chore(desktop): instalador NSIS para Windows con electron-builder"
```

---

### Task 12: Retirar `mobile/` y actualizar documentación

**Files:**
- Delete: `mobile/`
- Modify: `.gitignore`, `README.md`, `docs/ARCHITECTURE.md`

- [ ] **Step 1: Comprobar que nada del escritorio depende de `mobile/`**

Run: `grep -rn "mobile/" desktop/src desktop/*.ts desktop/*.yml` → Expected: sin resultados.

- [ ] **Step 2: Eliminar `mobile/` en su propio commit**

```bash
git rm -r -q mobile
git commit -m "chore: retirar la app móvil Expo (reemplazada por desktop/)"
```

- [ ] **Step 3: `.gitignore`**

Quitar `.expo/`, `android/`, `ios/`. Añadir:
```
desktop/out/
desktop/release/
```

- [ ] **Step 4: README**

Reescribir las secciones de móvil. Contenido obligatorio:
- Intro: "App de escritorio (Windows) que traducirá señas comunes de reuniones a voz." y el árbol `desktop/ backend/ docker-compose.yml docs/`.
- Requisitos: Docker, Python 3.12+, Node.js 20+ (probado con 24), Windows 10/11 con una voz en español instalada y una webcam.
- Sección **Escritorio**:
  ```bash
  cd desktop
  npm install
  cp .env.example .env        # RENDERER_VITE_API_URL (por defecto http://localhost:8000)
  npm run dev                 # app en modo desarrollo con recarga en caliente
  npm run build:win           # instalador en desktop/release/
  ```
  Aviso: `RENDERER_VITE_API_URL` se fija **al compilar** (también en la CSP); cambiarla exige recompilar.
- Uso: registro/login; Frases (clic o teclas 1–9); Cámara (webcam, aviso "próximamente", depuración, selector si hay varias); Ajustes (voz del sistema, volumen, velocidad, cámara preferida, cerrar sesión).
- Seguridad: tokens cifrados con DPAPI (`safeStorage`) en `%APPDATA%/SeñaVoz/session.bin`; contextIsolation + sandbox; CSP; solo permiso de cámara.
- Endpoints y variables del backend: igual que antes, con `CORS_ORIGINS=http://localhost:5173,app://senavoz`.
- Tests: `cd desktop && npm test && npm run typecheck`; `cd backend && pytest`. Actualizar recuentos con los números reales obtenidos.
- "Qué se verificó y qué NO": rellenar con lo verificado en el Task 13 (sin inventar); en "NO": macOS/Linux, firma de código, auto-update.
- Decisiones de dependencias: Electron + electron-vite; react-router con `HashRouter`; Vitest; Web Speech API (voces del sistema; no permite elegir dispositivo de salida → Fase 4).

- [ ] **Step 5: ARCHITECTURE**

- Diagrama mermaid: sustituir el subgrafo `Phone` por `Desktop["App de escritorio (Electron)"]` con `Cam["getUserMedia (webcam)"]`, `Rec["SignRecognizer (MVP: Mock · F3: tasks-vision + modelo)"]`, `Speech["SpeechService (Web Speech · F4: audio cacheado + setSinkId)"]`, `UI["React + React Router, Zustand + TanStack Query"]`, `Store[("safeStorage (DPAPI) vía IPC")]`. Eliminar el subgrafo `Companion` y sustituirlo por `VCable["Cable de audio virtual"] --> Meet["Reunión"]` con `Speech -. "F4: setSinkId" .-> VCable`.
- Estructura: describir `desktop/src/{main,preload,shared,renderer}` como en este plan.
- Decisiones: añadir "Electron" (reutiliza el TS del MVP, `tasks-vision` en el renderer, `setSinkId`), "Protocolo propio `app://senavoz`" (origen estable para CORS; sin `file://`), "Tokens en el proceso main con `safeStorage`". Cambiar "Inferencia on-device" a "Inferencia local" (en el PC). Reescribir "Audio hacia la reunión": la app corre en el mismo PC → reproduce directamente en el cable virtual con `setSinkId`; `speechSynthesis` no permite elegir salida, por eso hacen falta audios pregenerados.
- Roadmap: Fase 2 con `@mediapipe/tasks-vision` (HandLandmarker, modo VIDEO) sobre la webcam, grabación en ráfaga con cuenta atrás; Fase 3 inferencia en el renderer con TF.js u ONNX Runtime Web (**dirección, no decisión**); Fase 4 sin companion ni WebSocket.

- [ ] **Step 6: Commit**

```bash
git add .gitignore README.md docs/ARCHITECTURE.md
git commit -m "docs: README y ARCHITECTURE para la app de escritorio"
```

---

### Task 13: Verificación de extremo a extremo

**Files:** ninguno (solo si se corrigen fallos encontrados; en ese caso, commit `fix(desktop): …` por cada corrección, con su test).

- [ ] **Step 1: Suites**

Run: `cd desktop && npm test && npm run typecheck` → todo PASS. `cd backend && .venv/Scripts/python -m pytest` → todo PASS. Anotar los recuentos.

- [ ] **Step 2: Recorrido real en `npm run dev`** (backend con `docker compose up -d`)

Comprobar, uno por uno:
1. Registro de un usuario nuevo → entra en Frases.
2. Clic en una tarjeta y tecla `1` → reproducen voz (pedir al usuario que confirme que oye el audio). `Ctrl+1` no reproduce.
3. Cámara → preview real en espejo; "Simular seña" muestra "Seña detectada" y habla.
4. Abrir otra app que use la cámara (si es posible) → mensaje "en uso" y Reintentar funciona al cerrarla.
5. Ajustes → cambiar voz, volumen y velocidad; "Probar voz" refleja el cambio (confirmación del usuario).
6. Cerrar la app y reabrirla → sigue autenticado.
7. Cerrar sesión → vuelve a login; reabrir → sigue en login.
8. Verificar en `%APPDATA%` que `session.bin` no contiene el refresh token en claro (`findstr` del valor devuelto por la API no lo encuentra).

- [ ] **Step 3: Ejecutable empaquetado**

`npm run build:win` y repetir 1, 2, 6 con `release/win-unpacked/SenaVoz.exe`.

- [ ] **Step 4: Actualizar README con lo verificado**

Rellenar "Qué se verificó y qué NO" con los resultados reales (incluidas las comprobaciones hechas por el usuario) y commit:
```bash
git add README.md
git commit -m "docs: resultados de la verificación de la app de escritorio"
```
