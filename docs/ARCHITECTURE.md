# Arquitectura de SeñaVoz

## Vista general

```mermaid
flowchart LR
  subgraph Desktop["App de escritorio (Electron, Windows)"]
    subgraph Renderer["Renderer (React)"]
      Cam["getUserMedia\n(webcam)"]
      Rec["MediaPipe Hand Landmarker\n(landmarks locales · GRU del usuario en memoria)"]
      Speech["SpeechService\n(voces de Windows + setSinkId)"]
      UI["React Router\nZustand + TanStack Query"]
      Cam --> Rec --> Speech
      UI --> Speech
    end
    Main["Proceso main\nprotocolo app:// · permisos"]
    Store[("safeStorage (DPAPI)\ntokens")]
    UI -- "IPC (preload)" --> Main --> Store
  end

  subgraph Server["Backend (Docker)"]
    API["FastAPI\n/auth /users /phrases\n/samples /models"]
    DB[("PostgreSQL")]
    Trainer["trainer (PyTorch)"]
    API --> DB
    Trainer --> DB
  end

  VCable["Cable de audio virtual"]
  Meet["Reunión (Zoom/Meet/Teams)"]

  UI -- "HTTPS + JWT" --> API
  Rec -- "muestras (landmarks)" --> API
  API -- "pesos GRU (memoria)" --> Rec
  Speech -- "setSinkId" --> VCable --> Meet
```

## Estructura

- `backend/app/api`: routers finos (auth, users, phrases, health) → `services/` (lógica) → `db/models.py`.
- `backend/app/core`: config (pydantic-settings), seguridad (Argon2, JWT, SHA-256), dependencias (usuario actual).
- `desktop/src/main`: arranque de Electron. Protocolo `app://senavoz` (`appProtocol.ts`, resolución segura de rutas), permisos y navegación (`security.ts`), almacén de tokens cifrado (`tokenStore.ts`) y User-Agent ASCII (`userAgent.ts`). La lógica va en funciones puras con dependencias inyectadas, testeadas sin Electron.
- `desktop/src/preload`: expone con `contextBridge` solo `window.senavoz.tokens.{get, save, clear}`.
- `desktop/src/shared/ipc.ts`: contrato IPC (tipos y nombres de canal) compartido por main, preload y renderer.
- `desktop/src/renderer/src`:
  - `routes/`: pantallas y guard (`RequireAuth` / `RequireGuest` según `useSession().status`).
  - `api/`: cliente axios + interceptor.
  - `store/`: Zustand (sesión, ajustes).
  - `services/`: voz, cámara y reconocimiento, detrás de interfaces.
  - `hooks/`: atajos de teclado.
  - `ui/`: componentes.
  - `i18n/`: textos.

## Autenticación

1. `login` devuelve access (JWT, 15 min) + refresh (aleatorio opaco, 7 días).
2. El servidor guarda **solo el SHA-256** del refresh en `refresh_tokens`.
3. `refresh` **rota**: marca el token usado como `revoked_at` y `replaced_by = nuevo`.
4. Reutilizar un refresh ya revocado se interpreta como posible robo: se revocan **todos** los refresh del usuario.
5. `logout` revoca el refresh recibido (idempotente).
6. En la app, ante un 401 el interceptor hace **un único** refresh, compartido por todas las peticiones concurrentes, y reintenta. Si falla, borra los tokens y cierra la sesión.
7. Los tokens viven cifrados en el proceso main (`safeStorage`). El renderer los pide por IPC y guarda una copia en memoria. Si el cifrado del sistema no está disponible, `save` falla y la sesión no se guarda.

Los errores de login son genéricos ("Correo o contraseña incorrectos"). Cuando el email no existe, Argon2 verifica contra un hash señuelo, para no filtrar si existe ni por mensaje ni por tiempo.

## Modelo de datos

Migración `0001`: `users`, `refresh_tokens`, `phrases`. Migración `0002`: `sign_samples`, `sign_models`. Ambas tablas nuevas se borran en cascada con el usuario.

**`sign_samples`** — ráfagas grabadas por el usuario para entrenar.

| Columna    | Tipo            | Nota                                                                           |
| ---------- | --------------- | ------------------------------------------------------------------------------ |
| id         | UUID PK         |                                                                                |
| user_id    | UUID FK → users | índice compuesto `(user_id, label)`                                            |
| label      | varchar(50)     | `code` de una frase del catálogo o `neutral` (reposo)                          |
| data       | bytea           | 30 × 126 `float32` little-endian (15.120 bytes), valores ≤ 2 en valor absoluto |
| created_at | timestamptz     |                                                                                |

**`sign_models`** — entrenamientos por usuario; solo se conserva el último modelo listo.

| Columna     | Tipo            | Nota                                                  |
| ----------- | --------------- | ----------------------------------------------------- |
| id          | UUID PK         |                                                       |
| user_id     | UUID FK → users |                                                       |
| status      | varchar(20)     | `queued` → `training` → `ready` o `failed`            |
| labels      | JSON            | etiquetas con el mínimo de muestras, ordenadas        |
| weights     | JSON            | formato `senavoz-gru-v1` (puertas r, z, n de PyTorch) |
| metrics     | JSON            | `val_accuracy`, `per_label`, `samples`                |
| error       | text            | motivo del fallo, visible para el usuario             |
| created_at  | timestamptz     |                                                       |
| finished_at | timestamptz     |                                                       |

## Decisiones

**App de escritorio (Electron).** La app corre en el mismo PC que la videollamada. Así la voz puede ir directamente a un cable de audio virtual que la reunión usa como micrófono, sin companion ni WebSocket. Electron permite reutilizar la lógica TS del MVP móvil y ejecutar `@mediapipe/tasks-vision` (WASM/GPU) en el renderer sin código nativo. Plataforma objetivo: Windows.

**Protocolo propio `app://senavoz`.** La UI no se carga desde `file://`, cuyo origen `null` complica CORS y la CSP. `app://senavoz` da un origen estable que el backend autoriza en `CORS_ORIGINS`, y el handler solo sirve archivos dentro de la carpeta de la UI. Electron incluye el nombre de la app en el User-Agent, así que se normaliza a ASCII: con la ñ, Chromium rechaza las subpeticiones de `app://`.

**Proceso main mínimo y aislado.** Main solo gestiona ventana, protocolo, permisos (solo cámara) y tokens. Toda la lógica de producto está en el renderer, con `contextIsolation` + `sandbox`. El preload expone una API de tres funciones.

**Visión local.** MediaPipe Hand Landmarker detecta hasta dos manos en el renderer y produce landmarks; nunca se envía vídeo. El archivo del detector y el WASM con SIMD se empaquetan localmente. Se clasifica uno de cada 3 frames para no cargar la CPU durante las reuniones.

El artefacto de detección de manos incluido es el modelo oficial [Hand Landmarker](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task); MediaPipe lo utiliza para extraer keypoints y no para clasificar señas del catálogo.

**Datos y modelo de señas.** Las muestras (solo landmarks, 30 × 126 por ráfaga) viven en el servidor asociadas a la cuenta, y el usuario puede borrarlas cuando quiera. El servicio `trainer` toma los entrenamientos en cola y entrena una GRU pequeña (126 → 64) con PyTorch CPU; la API no importa `torch`. La app ejecuta la GRU en TypeScript puro, verificada contra PyTorch con un fixture y sin runtimes de ML. Los pesos se piden con `no-store`, solo viven en memoria y se descartan al cerrar sesión. La clase `neutral` (reposo) nunca produce frase. Spec: `docs/superpowers/specs/2026-10-07-trained-sign-model-design.md`.

**TTS pregenerado/cacheado.** Las frases son un conjunto cerrado y pequeño. Se pueden pregenerar con una voz de más calidad que la del sistema y reproducirlas localmente. `SpeechService` lo abstrae: `GeneratedSpeechService` reproduce el audio generado con las voces de Windows (precargado para todo el catálogo) y, solo fuera del Modo reunión, cae a `WebSpeechService` si la síntesis falla.

**Audio hacia la reunión (Modo reunión).** El main genera WAV con las voces OneCore de Windows (`resources/tts/synth.ps1`, WinRT vía PowerShell) y los guarda en `userData/tts-cache/` por voz + velocidad + texto. El renderer los reproduce con `HTMLAudioElement.setSinkId()` hacia VB-Cable ("CABLE Input"), que la reunión usa como micrófono ("CABLE Output"). En Modo reunión la voz nunca sale por los altavoces. La ventana se vuelve compacta y siempre visible, y Ctrl+Alt+1…9 funcionan con la reunión enfocada. Spec: `docs/superpowers/specs/2026-10-07-meeting-mode-design.md`.

**Interfaces desacopladas.** `SignRecognizer` y `SpeechService` son el contrato entre la UI y las capacidades cambiantes. `MediaPipeSignRecognizer` implementa la detección de manos, admite cambiar de clasificador sin reiniciar la cámara y emite los frames normalizados (los usa la pantalla Entrenar); la pantalla de cámara no depende directamente de MediaPipe.

## Roadmap

### Modelo de señas por usuario — hecho

Ver la spec `docs/superpowers/specs/2026-10-07-trained-sign-model-design.md` y el plan `docs/superpowers/plans/2026-10-07-trained-sign-model.md`.

### Modo reunión — hecho

Ver la spec `docs/superpowers/specs/2026-10-07-meeting-mode-design.md` y el plan `docs/superpowers/plans/2026-10-07-meeting-mode.md`.
