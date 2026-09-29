# SeñaVoz Escritorio — Diseño (subproyecto 1: app base)

Fecha: 2026-09-29 · Estado: aprobado en conversación, pendiente de revisión escrita

## Contexto y objetivo

SeñaVoz deja de ser una app móvil y pasa a ser una **app de escritorio**. La app Expo (`mobile/`) se **reemplaza** por completo. Motivos: MediaPipe es mucho más sencillo en escritorio (`@mediapipe/tasks-vision`, sin código nativo) y la voz hacia la reunión (Fase 4) ocurre en el mismo PC que la videollamada, sin companion ni WebSocket.

El cambio se descompone en subproyectos, cada uno con su spec y su plan:

1. **App de escritorio base** (este documento): portar el MVP a Electron.
2. Fase 2 — captura de datos (MediaPipe, muestras 30×126, `POST /samples`, `sign_samples`).
3. Fase 3 — entrenamiento e inferencia.
4. Fase 4 — voz hacia la reunión por cable de audio virtual.

Decisiones ya tomadas para la Fase 2 (se documentan aquí para no perderlas; se detallarán en su spec): grabación **en ráfaga con cuenta atrás** (3‑2‑1, 30 frames, pausa, repetir hasta N); secuencias de 30 × 126 normalizadas respecto a la muñeca con ceros para mano ausente; normalización en **TypeScript puro** reutilizable en la Fase 3.

**Criterio de éxito del subproyecto 1:** en Windows, la app de escritorio hace todo lo que hacía el MVP móvil (registro/login con sesión persistente, frases con voz, cámara con reconocedor simulado, ajustes, cerrar sesión que revoca), con tests en verde, y `mobile/` ya no existe en el repo.

Plataforma objetivo: **Windows**. macOS/Linux no se rompen a propósito, pero no se prueban.

## Stack

- **Electron 44**, **electron-vite 5** (Vite 8), **React 19**, **TypeScript**.
- **electron-builder** → instalador NSIS para Windows.
- React Router (`HashRouter`), Zustand, TanStack Query, axios, react-hook-form + zod.
- CSS Modules con variables CSS derivadas de `mobile/src/ui/theme.ts`; sin librería de componentes.
- Vitest 5 + Testing Library + jsdom.

## Arquitectura

```
desktop/
├── electron.vite.config.ts
├── electron-builder.yml
├── src/
│   ├── main/          # Node: ventana, protocolo app://, almacén de tokens, IPC
│   ├── preload/       # contextBridge: window.senavoz.tokens
│   ├── shared/        # tipos del contrato IPC (compartidos main/preload/renderer)
│   └── renderer/      # React: toda la app
│       ├── api/  auth/  i18n/  store/  services/  ui/  routes/
│       └── __tests__/
```

### Procesos

- **main** — crea la `BrowserWindow` (≈1100×720, mínimo 900×600), registra el protocolo `app://senavoz`, guarda los tokens y atiende el IPC. **No** hace HTTP ni contiene lógica de negocio.
- **preload** — expone con `contextBridge` exclusivamente:
  ```ts
  window.senavoz.tokens: {
    get(): Promise<{ accessToken: string; refreshToken: string } | null>;
    save(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
    clear(): Promise<void>;
  }
  ```
- **renderer** — la app completa: cliente HTTP, cámara (`getUserMedia`), voz (`speechSynthesis`), y en la Fase 2 MediaPipe.

### Almacén de tokens (main)

- Cifra con `safeStorage.encryptString` (DPAPI en Windows) y escribe un único archivo en `app.getPath('userData')`.
- Si `safeStorage.isEncryptionAvailable()` es falso, `save` **falla con error explícito**; nunca se guarda en claro.
- Archivo ausente, corrupto o indescifrable → `get` devuelve `null` (el usuario vuelve a iniciar sesión).

### Protocolo `app://senavoz`

- Registrado como esquema privilegiado (`standard`, `secure`, `supportFetchAPI`) antes de `app.ready`.
- Sirve solo archivos dentro de la carpeta de la UI compilada; rutas que resuelven fuera de ella (path traversal) → 404. Ruta desconocida → `index.html`.
- En desarrollo la ventana carga el servidor de Vite (`http://localhost:5173`).

### Seguridad

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- CSP: `default-src 'self'`; `connect-src 'self' <API_URL>`; `media-src`/`img-src` `'self' blob: data:`. (En la Fase 2 se ampliará para el WASM/modelo de MediaPipe.)
- `setPermissionRequestHandler`/`setPermissionCheckHandler`: solo se concede `media` (vídeo) a los orígenes propios; todo lo demás se deniega.
- `will-navigate` bloqueado fuera del origen propio; `setWindowOpenHandler` → `deny`.

### Configuración

- `RENDERER_VITE_API_URL` (por defecto `http://localhost:8000`; prefijo exigido por electron-vite), inyectada en tiempo de build. `.env.example` en `desktop/`. La CSP se define en `index.html` con `%RENDERER_VITE_API_URL%`.

## Reutilización del código móvil

Se porta casi sin cambios (ajustando imports): `api/` (cliente axios con **un único refresh compartido** ante 401 concurrentes y cierre de sesión si falla; endpoints; errores; tipos; `usePhrases`), `store/session.ts`, `auth/schemas.ts`, `i18n/` (solo `es`), `services/speech/SpeechService.ts`, `services/recognition/{SignRecognizer,MockSignRecognizer}.ts`.

Implementaciones de plataforma que cambian:

| Móvil | Escritorio |
|---|---|
| `tokenStorage` con `expo-secure-store` | `tokenStorage` sobre `window.senavoz.tokens` (misma interfaz) |
| `ExpoSpeechService` | `WebSpeechService` (`speechSynthesis`) |
| `CachedAudioSpeechService` con `expo-audio` | mismo servicio con `HTMLAudioElement` |
| `store/settings` con AsyncStorage | `store/settings` con `localStorage` (zustand `persist`) |
| expo-router `Stack.Protected` | React Router + guard por `useSession().status` |

## Pantallas

Layout autenticado con **barra lateral**: Frases · Cámara · Ajustes. Tema oscuro. Mientras `status === 'loading'` (restauración al arrancar) se muestra un splash.

- **Login / Registro** — mismo comportamiento que el móvil: validación zod (contraseña ≥ 8 con letra y número), normalización del email (trim + minúsculas), mensaje genérico en credenciales incorrectas, errores de red. Registrarse inicia sesión directamente.
- **Frases** — cuadrícula de tarjetas; clic o Enter/Espacio reproduce la frase. **Atajos `1`–`9`** reproducen las nueve primeras frases (ignorados mientras el foco está en un campo de texto). Estados de carga y error con reintento.
- **Cámara** — `getUserMedia({ video })` en un `<video>` en espejo; texto "Reconocimiento de señas: próximamente"; panel de depuración que dispara `MockSignRecognizer.simulate()` recorriendo las frases y las reproduce en voz, mostrando la última seña. Errores diferenciados: permiso denegado, **sin cámara**, **cámara en uso** por otra app (`NotReadableError`). Si hay más de una webcam, **selector de cámara**; la elección (`deviceId`) se guarda en ajustes. Al salir de la pantalla se detienen las pistas del stream.
- **Ajustes** — perfil (nombre, email), volumen, velocidad, **voz** (lista de `speechSynthesis.getVoices()` filtrada a `es-*`, con la del sistema por defecto; se actualiza en `voiceschanged`), cámara preferida, y **Cerrar sesión** (revoca el refresh en el servidor; si falla la red, cierra igualmente en local).

### Voz

`WebSpeechService implements SpeechService`: cancela lo que suene (`speechSynthesis.cancel()`) antes de hablar, usa `lang = 'es-ES'`, la voz elegida (si ya no existe, la por defecto), volumen y velocidad de ajustes. La elección del **dispositivo de salida** (cable virtual) **no** forma parte de este subproyecto; `speechSynthesis` no lo permite y se resolverá en la Fase 4 con audio pregenerado y `setSinkId`.

## Backend

Único cambio: añadir `http://localhost:5173` y `app://senavoz` a `CORS_ORIGINS` (valor en `.env.example` y en `docker-compose.yml`), quitando los orígenes de Expo. Test nuevo: preflight `OPTIONS` desde `app://senavoz` devuelve `access-control-allow-origin` correcto, y desde un origen no listado no lo devuelve.

## Tests

Renderer (Vitest + Testing Library + jsdom), portados del móvil:
- Login: validación, normalización del email, errores (credenciales y red).
- Store de sesión: login, restore (con y sin refresh guardado), logout que revoca y logout sin red.
- Cliente HTTP: un único refresh ante varios 401 concurrentes; cierre de sesión si el refresh falla.

Nuevos:
- `WebSpeechService`: cancela antes de hablar; aplica voz/volumen/velocidad; cae a la voz por defecto si la elegida no existe.
- Atajos `1`–`9`: reproducen la frase correcta; no se disparan con el foco en un input.
- Main — almacén de tokens (con `safeStorage` y `fs` simulados): guarda cifrado y lee; `clear` borra; archivo corrupto → `null`; cifrado no disponible → error, sin escribir nada.
- Main — resolución de rutas del protocolo: sirve archivos dentro de la raíz; rechaza `..`/rutas absolutas/codificadas que escapen; ruta desconocida → `index.html`.

Además: `npm run typecheck` (tsconfig de main/preload y de renderer) y los tests del backend.

## Cambios en el repositorio

- Commit propio que **elimina `mobile/`** (queda en el historial de git).
- `.gitignore`: quitar entradas de Expo (`.expo/`, `android/`, `ios/`); añadir `desktop/out/`, `desktop/release/`.
- README: requisitos (Node, Docker), `npm run dev`, `npm run build:win`, tests, qué se verificó y qué no.
- ARCHITECTURE: diagrama (Escritorio en lugar de Móvil y Companion), decisiones (Electron, `safeStorage`, protocolo propio) y roadmap: Fase 4 sin companion ni WebSocket; la inferencia de la Fase 3 apunta a `tasks-vision` + TF.js u ONNX Runtime Web en el renderer, **como dirección, no decisión**.

## Verificación

En esta máquina (Windows):
1. Backend con `docker compose up --build`.
2. `npm run dev` en `desktop/` y recorrido real: registro → Frases (clic y atajos reproducen voz) → Cámara (preview real, simulación) → Ajustes (voz, volumen, cámara) → cerrar la app y reabrirla sigue autenticado → Cerrar sesión. Lo que no pueda comprobar yo (p. ej. oír el audio) se le pide confirmar al usuario.
3. `npm run build:win` genera el instalador; el ejecutable empaquetado arranca bajo `app://senavoz` y habla con la API (CORS correcto).

## Fuera de alcance

Captura de datos (Fase 2), macOS/Linux, auto-update, firma de código, selección de dispositivo de salida de audio, idiomas distintos de `es`.
