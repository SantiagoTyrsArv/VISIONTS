# SeñaVoz

App de escritorio (Windows) para traducir señas a voz. Incluye autenticación, catálogo de frases, reproducción de voz y detección local de manos con MediaPipe. La traducción de señas requiere un modelo semántico entrenado, que aún no está incluido; la salida de voz hacia reuniones también está pendiente (ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

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

Levanta `db` (Postgres 17) y `api`. Al arrancar, el contenedor ejecuta `alembic upgrade head` y el seed idempotente de frases. La API queda en <http://localhost:8000>, con documentación interactiva en `/docs`.

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

| Método | Ruta             | Auth   | Descripción                                                                                    |
| ------ | ---------------- | ------ | ---------------------------------------------------------------------------------------------- |
| POST   | `/auth/register` | –      | 201 + usuario (nunca el hash). Contraseña ≥ 8, letra y número                                  |
| POST   | `/auth/login`    | –      | `{access_token, refresh_token, token_type, expires_in}`                                        |
| POST   | `/auth/refresh`  | –      | Nuevo par; **rota** el refresh. Reutilizar uno ya rotado revoca todas las sesiones del usuario |
| POST   | `/auth/logout`   | –      | 204; revoca ese refresh token (idempotente)                                                    |
| GET    | `/users/me`      | Bearer | Perfil                                                                                         |
| GET    | `/phrases`       | Bearer | Catálogo de frases                                                                             |
| GET    | `/health`        | –      | Liveness                                                                                       |

Access token: 15 min. Refresh token: 7 días, `secrets.token_urlsafe`, guardado como SHA-256. Rate limiting por IP en login (5/min), register (10/min) y refresh (30/min).

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
cp .env.example .env        # RENDERER_VITE_API_URL (por defecto http://localhost:8000)
npm run dev                 # app en modo desarrollo con recarga en caliente
npm run build:win           # instalador en desktop/release/SenaVoz-Setup-<versión>.exe
```

**`RENDERER_VITE_API_URL` se fija al compilar**, porque también se escribe en la CSP de `index.html`. Si la cambias, hay que recompilar. Debe ser alcanzable desde el PC (normalmente `http://localhost:8000`).

### Uso

1. Regístrate (entras directamente) o inicia sesión. La sesión se mantiene al cerrar y reabrir la app.
2. **Frases**: haz clic en una tarjeta (o pulsa Enter/Espacio) y se reproduce en voz. **Atajos 1–9** para las nueve primeras frases; no se disparan mientras escribes ni con Ctrl/Alt.
3. **Cámara**: vista de la webcam en espejo; MediaPipe detecta hasta dos manos y muestra su estado. La app empaqueta el runtime WASM y el modelo de detección, por lo que no necesita descargar esos archivos al iniciarse. Para traducir una seña a una frase y voz todavía hace falta configurar un clasificador entrenado. Si hay varias webcams aparece un selector; los errores de permiso y cámara mantienen su mensaje específico y opción "Reintentar".
4. **Ajustes**: perfil, voz del sistema (voces `es-*` instaladas), volumen, velocidad, cámara preferida (si se desenchufa, se usa la predeterminada) y **Cerrar sesión**, que revoca el refresh token en el servidor.

### Seguridad

- Los tokens solo se guardan **cifrados con `safeStorage` (DPAPI de Windows)** en `%APPDATA%\SeñaVoz\session.bin`, desde el proceso main. Si el cifrado no está disponible, la sesión no se guarda (nunca en claro). Las preferencias no sensibles van a `localStorage`.
- `contextIsolation` + `sandbox` activados y `nodeIntegration` desactivado. El preload solo expone `window.senavoz.tokens.{get, save, clear}`.
- La UI se sirve desde el protocolo propio `app://senavoz`, que solo entrega archivos de la carpeta de la UI. La CSP limita `connect-src` a la API.
- Solo se concede el permiso de cámara a la propia app. La navegación externa y `window.open` están bloqueados.

## Tests

```bash
# Backend (SQLite en memoria; no requiere Postgres)
cd backend && pytest

# Escritorio
cd desktop
npm test              # Vitest: proyectos main (node) y renderer (jsdom + Testing Library)
npm run typecheck     # tsc para main/preload y renderer
```

- **Backend (22 tests):** registro, email duplicado, contraseñas débiles, login correcto e incorrecto (respuestas indistinguibles), rate limit, `/users/me` con y sin token, refresh con rotación, detección de reutilización, refresh expirado, logout, frases, seed idempotente y CORS de los orígenes de escritorio.
- **Escritorio, main (20 tests):** almacén de tokens cifrado (incluidos archivo corrupto y cifrado no disponible), resolución de rutas de `app://` (path traversal, también codificado), orígenes y permisos de confianza, y User-Agent ASCII.
- **Escritorio, renderer (71 tests):** login, guard de rutas, sesión, cliente HTTP, voz, atajos, frases, ajustes, cámara y reconocimiento (normalización 30×126, clasificación con umbral/cooldown y ciclo de vida de MediaPipe).

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

**No verificado:**

- La detección con una webcam física no se comprobó manualmente en esta sesión. El clasificador semántico y la emisión de voz por predicciones reales requieren un modelo entrenado, que no está disponible en el proyecto.
- La suite completa del escritorio tiene 3 fallos existentes en `client.test.ts` (88 de 91 tests pasan); no corresponden al reconocimiento de cámara.
- Que el audio **se oiga** bien: se comprobó que la síntesis se activa, no la calidad del sonido.
- La ejecución del instalador NSIS (asistente, accesos directos y desinstalación).
- macOS y Linux, firma de código y auto-update (fuera de alcance).

## Decisiones de dependencias

- **Electron + electron-vite + React/TypeScript**: reutiliza la lógica TS del MVP móvil (cliente con refresh, stores, i18n). `@mediapipe/tasks-vision` corre en el renderer sin código nativo; detección de manos disponible, clasificador semántico pendiente. `setSinkId` queda para la Fase 4.
- **Vite 7** (no 8) y **TypeScript 5.9**: son las versiones que admite electron-vite 5 y su tsconfig base.
- **react-router** con `HashRouter` (funciona igual bajo `app://` y en desarrollo), **Zustand**, **TanStack Query**, **react-hook-form + zod 4**.
- **Vitest** con dos proyectos (main en Node y renderer en jsdom). La lógica del main se escribe con dependencias inyectadas para testearla sin Electron.
- **Web Speech API** para la voz (voces del sistema). No permite elegir el dispositivo de salida, así que enviar la voz a la reunión requerirá audio pregenerado + `setSinkId` (Fase 4).
- Las dependencias del renderer son `devDependencies`: Vite las empaqueta, así que no entran en el `app.asar`.
- El **User-Agent se normaliza a ASCII** ("SenaVoz"), porque con la ñ del nombre Chromium rechazaba las subpeticiones de `app://` y la app empaquetada se quedaba en blanco.
- Textos de UI centralizados en `desktop/src/renderer/src/i18n` (solo `es`).
