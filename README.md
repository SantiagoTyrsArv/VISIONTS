# SeñaVoz

App de escritorio (Windows) para traducir señas a voz. Incluye autenticación, catálogo de frases, reproducción de voz y detección local de manos con MediaPipe. Cada usuario entrena su propio modelo de señas desde la pantalla Entrenar; la voz llega a cualquier app de reuniones (Zoom, Teams, Meet…) a través del **Modo reunión** (ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

```
senavoz/
├── desktop/    # Electron + React + TypeScript (electron-vite)
├── backend/    # FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
├── docker-compose.yml
└── docs/       # ARCHITECTURE.md, specs y planes
```

## Requisitos

| Para                       | Necesitas                                                                     |
| -------------------------- | ----------------------------------------------------------------------------- |
| Backend con Docker         | Docker + Docker Compose                                                       |
| Backend sin Docker / tests | Python 3.12+ (Docker usa 3.12; los tests también pasan en 3.14)               |
| App de escritorio          | Node.js 20+ (probado con 24), npm, Windows 10/11                              |
| Voz                        | Una voz en español instalada en Windows (Configuración › Hora e idioma › Voz) |
| Cámara                     | Una webcam                                                                    |

## Backend

```bash
docker compose up --build
```

Levanta `db` (Postgres 17), `api` y `trainer` (entrena los modelos de señas en cola con PyTorch CPU). Ambos salen del mismo `Dockerfile` con objetivos distintos: la imagen de la API no incluye PyTorch. Al arrancar, el contenedor ejecuta `alembic upgrade head` y el seed idempotente de frases. La API queda en <http://localhost:8000>, con documentación interactiva en `/docs`.

> Las credenciales de BD y el `JWT_SECRET` por defecto de `docker-compose.yml` son **solo para desarrollo**. Para cualquier otro entorno defínelos (`POSTGRES_PASSWORD`, `JWT_SECRET`) en un `.env` junto al compose. El secreto JWT debe tener ≥ 32 caracteres.

### Sin Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env                                   # apunta DATABASE_URL a tu Postgres
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload
```

### Endpoints

| Método | Ruta                    | Auth   | Descripción                                                                                    |
| ------ | ----------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`        | –      | 201 + usuario (nunca el hash). Contraseña ≥ 8, letra y número                                  |
| POST   | `/auth/login`           | –      | `{access_token, refresh_token, token_type, expires_in}`                                        |
| POST   | `/auth/refresh`         | –      | Nuevo par; **rota** el refresh. Reutilizar uno ya rotado revoca todas las sesiones del usuario |
| POST   | `/auth/logout`          | –      | 204; revoca ese refresh token (idempotente)                                                    |
| GET    | `/users/me`             | Bearer | Perfil                                                                                         |
| GET    | `/phrases`              | Bearer | Catálogo de frases                                                                             |
| GET    | `/health`               | –      | Liveness                                                                                       |
| POST   | `/samples`              | Bearer | 201; una ráfaga de 30 × 126 valores para una frase o `neutral`. Máx. 100 por etiqueta          |
| GET    | `/samples/summary`      | Bearer | Nº de muestras por etiqueta                                                                    |
| DELETE | `/samples`              | Bearer | 204; con `?label=` borra esa etiqueta; sin él, todas las muestras y modelos                    |
| POST   | `/models/train`         | Bearer | 202; encola un entrenamiento (409 si ya hay uno; 422 si faltan muestras)                       |
| GET    | `/models/status`        | Bearer | Último modelo listo y entrenamiento más reciente                                               |
| GET    | `/models/ready/weights` | Bearer | Pesos `senavoz-gru-v1` con `Cache-Control: no-store`                                           |

Access token: 15 min. Refresh token: 7 días, `secrets.token_urlsafe`, guardado como SHA-256. Rate limiting por IP en login (5/min), register (10/min) y refresh (30/min), y por usuario en `POST /samples` (60/min) y `POST /models/train` (10/hora).

### Variables de entorno (`backend/.env.example`)

| Variable                                      | Descripción                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | URL SQLAlchemy (`postgresql+psycopg://...`)                                                 |
| `JWT_SECRET`                                  | Secreto de firma, ≥ 32 caracteres. **Solo por entorno**                                     |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | Vigencias (15 / 7)                                                                          |
| `CORS_ORIGINS`                                | Orígenes permitidos separados por comas. Para la app: `http://localhost:5173,app://senavoz` |
| `RATE_LIMIT_LOGIN` / `_REGISTER` / `_REFRESH` | Formato slowapi, p. ej. `5/minute`                                                          |

Nota: el límite de peticiones usa la memoria del proceso. Con varios workers o réplicas habría que moverlo a Redis.

## App de escritorio

```bash
cd desktop
npm install
cp .env.example .env        # opcional: RENDERER_VITE_API_URL (sin .env se usa http://localhost:8000)
npm run dev                 # app en modo desarrollo con recarga en caliente
npm run build:win           # instalador en desktop/release/SenaVoz-Setup-<versión>.exe
```

**`RENDERER_VITE_API_URL` se fija al compilar**, porque también se escribe en la CSP de `index.html`. Si la cambias, hay que recompilar. Debe ser alcanzable desde el PC (normalmente `http://localhost:8000`).

### Uso

1. Regístrate (entras directamente) o inicia sesión. La sesión se mantiene al cerrar y reabrir la app.
2. **Frases**: haz clic en una tarjeta (o pulsa Enter/Espacio) y se reproduce en voz. **Atajos 1–9** para las nueve primeras frases; no se disparan mientras escribes ni con Ctrl/Alt.
3. **Cámara**: vista de la webcam en espejo; MediaPipe detecta hasta dos manos y muestra su estado. La app empaqueta el runtime WASM y el modelo de detección, por lo que no necesita descargar esos archivos al iniciarse. Con un modelo entrenado, cada seña reconocida dice su frase; el panel muestra el estado del modelo y su precisión. Si hay varias webcams aparece un selector; los errores de permiso y cámara mantienen su mensaje específico y opción "Reintentar".
4. **Entrenar**: graba 20 muestras de **Reposo** y de al menos 2 frases (sesiones de 5 ráfagas con cuenta atrás), pulsa **Entrenar modelo** y espera a "Listo". Solo se envían los landmarks de las manos, nunca vídeo, y no se guarda nada en el equipo.
5. **Ajustes**: sección **Reunión** (detección de VB-Cable, salida y prueba por el cable), voz de Windows (voces `es-*` instaladas), volumen, velocidad, cámara preferida (si se desenchufa, se usa la predeterminada), **Borrar todos mis datos de entrenamiento** y **Cerrar sesión**, que revoca el refresh token en el servidor.

### Usar SeñaVoz en una reunión

1. Instala [VB-Cable](https://vb-audio.com/Cable/) (como administrador) y reinicia. SeñaVoz lo detecta en Ajustes › Reunión.
2. En Zoom, Teams o Meet elige **CABLE Output** como micrófono (una sola vez por app).
3. En SeñaVoz pulsa **Modo reunión**: la ventana se vuelve compacta y queda encima. Con la reunión enfocada, **Ctrl+Alt+1…9** dicen las frases 1–9. En este modo la voz nunca sale por los altavoces.

### Seguridad

- Los tokens solo se guardan **cifrados con `safeStorage` (DPAPI de Windows)** en `%APPDATA%\SeñaVoz\session.bin`, desde el proceso main. Si el cifrado no está disponible, la sesión no se guarda (nunca en claro). Las preferencias no sensibles van a `localStorage`.
- `contextIsolation` + `sandbox` activados y `nodeIntegration` desactivado. El preload expone `window.senavoz.tokens`, `tts` (voces, síntesis y poda de caché) y `meeting` (entrar, salir y atajos). Los textos a sintetizar llegan a PowerShell por stdin, nunca como argumentos.
- La UI se sirve desde el protocolo propio `app://senavoz`, que solo entrega archivos de la carpeta de la UI. La CSP limita `connect-src` a la API.
- Las muestras de señas (solo landmarks, nunca vídeo) y el modelo viven en el servidor; la app mantiene los pesos solo en memoria y los pide con `no-store`.
- Solo se conceden a la propia app los permisos de cámara y de elección de salida de audio (`setSinkId`). La navegación externa y `window.open` están bloqueados.

## Tests

```bash
# Backend (SQLite en memoria; no requiere Postgres)
cd backend && pytest

# Escritorio
cd desktop
npm test              # Vitest: proyectos main (node) y renderer (jsdom + Testing Library)
npm run typecheck     # tsc para main/preload y renderer
```

- **Backend (52 tests):** registro, email duplicado, contraseñas débiles, login correcto e incorrecto (respuestas indistinguibles), rate limit, `/users/me` con y sin token, refresh con rotación, detección de reutilización, refresh expirado, logout, frases, seed idempotente, CORS de los orígenes de escritorio, muestras (validación, tope, aislamiento entre usuarios y borrado), entrenamiento GRU (determinismo, tope de tiempo), cola de entrenamientos, estado y pesos `no-store`, y el worker.
- **Escritorio, main (46 tests):** almacén de tokens cifrado (incluidos archivo corrupto y cifrado no disponible), resolución de rutas de `app://` (path traversal, también codificado), orígenes y permisos de confianza, y User-Agent ASCII.
- **Escritorio, renderer (140 tests):** login, guard de rutas, sesión, cliente HTTP, voz, atajos, frases, ajustes, cámara, reunión y reconocimiento (normalización 30×126, clasificación con umbral/cooldown, ciclo de vida de MediaPipe, GRU en TypeScript con paridad frente a PyTorch, modelo en memoria, ráfagas y pantalla Entrenar).

## Qué se verificó y qué NO

**Verificado en esta máquina (Windows 11), manejando la app real con Playwright:**

- Backend con Docker (migraciones y seed automáticos) y preflight CORS desde `app://senavoz`.
- App compilada servida desde `app://senavoz` y ejecutable empaquetado (`win-unpacked/SenaVoz.exe`):
  - registro, cierre y reapertura con la sesión recuperada;
  - 9 frases; clic, tecla y "Probar voz" activan `speechSynthesis`;
  - webcam real (1280×720) y seña simulada;
  - lista de voces del sistema (Helena, Laura, Pablo, Raúl, Sabina);
  - cerrar sesión, que se mantiene tras reabrir.
- `session.bin` está cifrado: no aparece ningún token en claro.
- Modo desarrollo (servidor de Vite con HMR): la UI carga bajo la CSP sin errores.
- Para esta entrega, 18 tests del reconocimiento pasan; `npm run build` y TypeScript pasan, y el artefacto incluye el modelo Hand Landmarker y los WASM locales.
- Revisión del 6/10/2026 sobre `win-unpacked/SenaVoz.exe` (instalador de 123 MB):
  - cerrar sesión e iniciarla desde el formulario, las 9 frases y el atajo 1 con voz en español;
  - webcam real (1280×720) con MediaPipe cargando su WASM por `app://`;
  - con el backend apagado, el login muestra "No se pudo conectar con el servidor";
  - la telemetría que MediaPipe intenta enviar a Google la bloquea la CSP;
  - los 91 tests del escritorio y los 22 del backend pasan, y el lint queda sin errores.

- Revisión del 8/10/2026 (modelo de señas por usuario):
  - `docker compose up --build` con `db`, `api` (migración `0002`) y `trainer` sin errores;
  - de extremo a extremo contra Postgres: 60 muestras subidas, `NaN` rechazado con 422, entrenamiento en cola (409 si se repite), modelo listo en unos 5 s, pesos con `Cache-Control: no-store` y borrado total;
  - `npm run build:win`: `app.asar` pasa de 35,4 MB a 22,9 MB al quitar el WASM sin SIMD.

**No verificado:**

- Grabar señas reales con una webcam física en la pantalla Entrenar y que Cámara y Modo reunión digan la frase con el modelo resultante (el flujo está cubierto por tests y por la prueba de extremo a extremo de la API con datos sintéticos).
- Que el audio **se oiga** bien: se comprobó que la síntesis se activa, no la calidad del sonido.
- La ejecución del instalador NSIS (asistente, accesos directos y desinstalación).
- macOS y Linux, firma de código y auto-update (fuera de alcance).

## Decisiones de dependencias

- **Electron + electron-vite + React/TypeScript**: reutiliza la lógica TS del MVP móvil (cliente con refresh, stores, i18n). `@mediapipe/tasks-vision` corre en el renderer sin código nativo; detección de manos local y clasificación con la GRU de cada usuario ejecutada en TypeScript puro. La voz se genera con las voces OneCore de Windows (WinRT vía PowerShell) y se envía con `setSinkId`.
- **Vite 7** (no 8) y **TypeScript 5.9**: son las versiones que admite electron-vite 5 y su tsconfig base.
- **react-router** con `HashRouter` (funciona igual bajo `app://` y en desarrollo), **Zustand**, **TanStack Query**, **react-hook-form + zod 4**.
- **Vitest** con dos proyectos (main en Node y renderer en jsdom). La lógica del main se escribe con dependencias inyectadas para testearla sin Electron.
- **Web Speech API** para la voz (voces del sistema). No permite elegir el dispositivo de salida, así que enviar la voz a la reunión requerirá audio pregenerado + `setSinkId` (Fase 4).
- Las dependencias del renderer son `devDependencies`: Vite las empaqueta, así que no entran en el `app.asar`.
- El **User-Agent se normaliza a ASCII** ("SenaVoz"), porque con la ñ del nombre Chromium rechazaba las subpeticiones de `app://` y la app empaquetada se quedaba en blanco.
- Textos de UI centralizados en `desktop/src/renderer/src/i18n` (solo `es`).
