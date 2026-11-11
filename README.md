# SeñaVoz

App de escritorio (Windows) para traducir señas a voz. Incluye autenticación, catálogo de frases, reproducción de voz y detección local de manos con MediaPipe. Reconoce señas de la Lengua de Señas Colombiana con un modelo incluido en la app (sin entrenar nada); la voz llega a cualquier app de reuniones (Zoom, Teams, Meet…) a través del **Modo reunión** (ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

```
senavoz/
├── desktop/    # Electron + React + TypeScript (electron-vite)
├── backend/    # FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
├── training/   # entrenamiento offline del modelo de señas (no se despliega)
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
cp .env.example .env        # rellena POSTGRES_PASSWORD y JWT_SECRET
docker compose up --build
```

Levanta `db` (Postgres 17) y `api`. Al arrancar, el contenedor ejecuta `alembic upgrade head` y el seed idempotente de frases. La API queda en <http://localhost:8000>, con documentación interactiva en `/docs`.

> `docker-compose.yml` no trae contraseñas: sin `POSTGRES_PASSWORD` y `JWT_SECRET` en el `.env` de la raíz, `docker compose` se niega a arrancar. El secreto JWT debe tener ≥ 32 caracteres. Postgres solo aplica la contraseña al crear el volumen `pgdata`: si ya lo tenías de antes (contraseña `senavoz`), pon esa en `.env` o bórralo con `docker compose down -v` (se pierden los datos locales).

### Sin Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install --require-hashes -r requirements-dev.lock
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

Para desplegar (Neon + Render), la API acepta la `DATABASE_URL` tal como la da Neon (`postgresql://…?sslmode=require`) y escucha en `$PORT`. Detrás del proxy de Render hay que definir `FORWARDED_ALLOW_IPS=*`: si no, el límite por IP vería a todos los usuarios como uno solo. Esa IP sale de `X-Forwarded-For` y el cliente puede falsificarla, así que el login lleva además un límite por cuenta (`RATE_LIMIT_LOGIN_ACCOUNT`: 20 contraseñas fallidas por hora y correo; un login correcto lo reinicia) que frena la fuerza bruta. Riesgo aceptado: quien conozca un correo puede bloquear esa cuenta durante una hora fallando 20 veces.

## Despliegue

La API está en **<https://senavoz-api.onrender.com>** (Render, plan gratuito) y la base de datos en **Neon** (Postgres 17, AWS us-east-1). GitHub Actions (`.github/workflows/ci.yml`) ejecuta los tests de `backend/`, `desktop/` y `training/` en cada push. Render despliega cada commit de `main` que cambie `backend/`, pero solo si esos checks pasan (`render.yaml`, `autoDeployTrigger: checksPass`).

Para montarlo desde cero:

1. **Neon** → New project (AWS us-east-1). Copia la cadena de conexión **directa**: sin `-pooler` en el host.
2. **Render** → New → Blueprint → este repo. Pega esa cadena en `DATABASE_URL` y pulsa Apply. `JWT_SECRET` se genera solo. Las rutas de Docker de `render.yaml` son relativas a `rootDir: backend`.
3. La app toma la URL de `desktop/.env.production` al compilar (`npm run build:win`).

**Antes de una demo, despierta la API:** abre <https://senavoz-api.onrender.com/health>. En el plan gratuito, Render se duerme tras 15 minutos sin uso y tarda unos 30–60 s en arrancar. La app espera hasta 60 s por petición.

Verificado el 23/10/2026:

- `/health` responde `{"status":"ok"}`, `/phrases` sin token devuelve 401 y el preflight CORS desde `app://senavoz` se acepta.
- El instalador de `build:win` lleva `connect-src 'self' https://senavoz-api.onrender.com` en la CSP y ninguna referencia a `localhost`.
- La app instalada se registra, inicia sesión y dice frases contra la API de producción.

Sin verificar: el login tras 15 minutos de inactividad (arranque en frío), el contenido de las tablas en Neon y que un push a `main` con cambios en `backend/` se despliegue solo.

## App de escritorio

```bash
cd desktop
npm install
cp .env.example .env        # opcional: RENDERER_VITE_API_URL (sin .env se usa http://localhost:8000)
npm run dev                 # app en modo desarrollo con recarga en caliente
npm run build:win           # instalador en desktop/release/SenaVoz-Setup-<versión>.exe
```

**`build:win` exige el modelo de señas** (`desktop/src/renderer/src/assets/sign-model.json`, lo genera `training/`). Sin él, `npm run dev` y los tests funcionan, pero la app muestra "Reconocimiento de señas no disponible" y solo dice frases con clic o atajo.

**`RENDERER_VITE_API_URL` se fija al compilar**, porque también se escribe en la CSP de `index.html`. Si la cambias, hay que recompilar. `npm run dev` usa `.env` (normalmente `http://localhost:8000`) y `build:win` usa `.env.production` (la API de Render).

### Uso

1. Al abrir, una pantalla de carga muestra los pasos reales del arranque (sesión, modelo de señas y frases). Regístrate (entras directamente) o inicia sesión. La sesión se mantiene al cerrar y reabrir la app.
2. **Señas** (pantalla de inicio): vista de la webcam en espejo; MediaPipe detecta hasta dos manos y muestra su estado. La app empaqueta el runtime WASM y el modelo de detección, por lo que no necesita descargar esos archivos al iniciarse. Las frases marcadas con **Seña** se reconocen al hacerlas frente a la cámara y se dicen en voz. Sobre el vídeo aparece la frase que está sonando; al lado, **Lo que has dicho** (las 5 últimas), el **Estado** (cámara, manos y modelo, con cuántas señas reconoce) y las **Frases rápidas** (clic o teclas 1–9). Si hay varias webcams aparece un selector; los errores de permiso y cámara mantienen su mensaje específico y opción "Reintentar".
   - En `npm run dev` (no en el instalador) aparece además un panel **Diagnóstico**: la probabilidad de cada clase frente al umbral del 80 % (para ver por qué una seña no se reconoce), la traza del último ciclo del event loop, las tareas largas del hilo principal, el INP y un selector para comparar el worker con «todo en el hilo principal».
3. **Frases**: haz clic en una tarjeta (o pulsa Enter/Espacio) y se reproduce en voz. **Atajos 1–9** para las nueve primeras frases; no se disparan mientras escribes ni con Ctrl/Alt.
4. **Ajustes**: sección **Reunión** (detección de VB-Cable, salida y prueba por el cable), voz de Windows (voces `es-*` instaladas), volumen, velocidad, cámara preferida (si se desenchufa, se usa la predeterminada), **Créditos** (atribución de LSC-54) y **Cerrar sesión**, que revoca el refresh token en el servidor.

### Usar SeñaVoz en una reunión

1. Instala [VB-Cable](https://vb-audio.com/Cable/) (como administrador) y reinicia. SeñaVoz lo detecta en Ajustes › Reunión.
2. En Zoom, Teams o Meet elige **CABLE Output** como micrófono (una sola vez por app).
3. En SeñaVoz pulsa **Modo reunión**: la ventana se vuelve compacta y queda encima. Con la reunión enfocada, **Ctrl+Alt+1…9** dicen las frases 1–9. En este modo la voz nunca sale por los altavoces.

### Seguridad

- Los tokens solo se guardan **cifrados con `safeStorage` (DPAPI de Windows)** en `%APPDATA%\SeñaVoz\session.bin`, desde el proceso main. Si el cifrado no está disponible, la sesión no se guarda (nunca en claro). Las preferencias no sensibles van a `localStorage`.
- `contextIsolation` + `sandbox` activados y `nodeIntegration` desactivado. El preload expone `window.senavoz.tokens`, `tts` (voces, síntesis y poda de caché) y `meeting` (entrar, salir y atajos). Los textos a sintetizar llegan a PowerShell por stdin, nunca como argumentos.
- La UI se sirve desde el protocolo propio `app://senavoz`, que solo entrega archivos de la carpeta de la UI. La CSP limita `connect-src` a la API; el worker de reconocimiento, donde corre MediaPipe, lleva la suya como cabecera y solo puede conectar con la propia app. Solo se abre una instancia: una segunda trae la primera al frente. Todas las respuestas llevan COOP + COEP (aislamiento de origen), que el worker de reconocimiento necesita para usar `SharedArrayBuffer`.
- La app no envía vídeo ni landmarks a ningún servidor: el modelo va dentro de la app.
- Solo se conceden a la propia app los permisos de cámara y de elección de salida de audio (`setSinkId`). La navegación externa y `window.open` están bloqueados.

## Tests

```bash
# Backend (SQLite en memoria; no requiere Postgres)
cd backend && pytest

# Escritorio
cd desktop
npm test              # Vitest: proyectos main (node) y renderer (jsdom + Testing Library)
npm run typecheck     # tsc para main/preload y renderer
npm run lint

# Entrenamiento (ver training/README.md para crear el entorno)
cd training && .venv\Scripts\python -m pytest
```

Recuentos del 10/11/2026 (todos pasan; 416 en total):

- **Backend (30 tests):** registro, email duplicado, contraseñas débiles, login correcto e incorrecto (respuestas indistinguibles), límites por IP y por cuenta, `/users/me` con y sin token, refresh con rotación, detección de reutilización, refresh expirado, logout, frases y seed idempotente, `/samples` y `/models` eliminados (404), CORS de los orígenes de escritorio, `DATABASE_URL` de Neon y Render convertida a psycopg 3, y la migración `0004` sube y baja.
- **Escritorio, main (51 tests):** almacén de tokens cifrado (incluidos archivo corrupto, cifrado no disponible y tokens con forma inválida), resolución de rutas de `app://` (path traversal, también codificado), CSP del worker, orígenes y permisos de confianza, User-Agent ASCII, síntesis de voz por PowerShell, y ventana y atajos del Modo reunión.
- **Escritorio, renderer (281 tests):** login, guard de rutas, sesión, cliente HTTP, voz, atajos, frases (distintivo "Seña"), ajustes, pantalla Señas, reunión, identidad visual (tema, logo, pantalla de carga y transiciones entre pantallas) y reconocimiento (normalización con paridad frente a `training/`, ventana temporal por intervalo y mano perdida, clasificación con umbral y pausa, ciclo de vida de MediaPipe, GRU en TypeScript con paridad frente a PyTorch, carga del modelo empaquetado, worker de reconocimiento con contrapresión, y panel de diagnóstico con traza del event loop, tareas largas e INP).
- **Training (54 tests):** extracción con caché, carga de LSC-54, normalización, clase `neutral`, etiquetas frente al catálogo de frases, validación por persona sin fuga, aumentos, determinismo y exportación de `sign-model.json`.

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
  - Este flujo (pantalla Entrenar, `/samples`, `/models` y `trainer`) se eliminó el 14/10/2026 al pasar al modelo global.

- Revisión del 23/10/2026 (modelo global y despliegue): la app instalada se registra, inicia sesión y dice frases contra la API de Render (ver [Despliegue](#despliegue)).

- Prueba manual del 3/11/2026 (`npm run dev` contra Docker local, webcam real, con el panel Diagnóstico): la app reconoce **"Buenos días"** y **"Buenas tardes"** hechas por una persona frente a la cámara, en la pantalla Cámara y en **Modo reunión** (la frase llega a la reunión). Es la primera prueba con una persona que no está en LSC-54. No hubo falsos positivos: con las manos quietas o bajadas no se dijo nada.

- Revisión del 8/11/2026 (identidad visual «la mano que habla»): la app compilada se recorrió con Playwright sobre el Electron real y se corrigió lo que salió de esa revisión (commit `b1c3b9c`).

- Medición del 9/11/2026 (reconocimiento en un Web Worker), con Playwright sobre el Electron real y cámara falsa alimentada por vídeos de LSC-54; 4 tandas alternas de 30 clics:
  - con el worker, la respuesta a un clic (INP) tiene una mediana de 16–24 ms (máximo 32 ms) y no hay tareas largas en el hilo principal;
  - con todo en el hilo principal, la mediana es de 64–96 ms (máximo 232 ms), con unas 250 tareas largas.

- Revisión del 10/11/2026 (auditoría), con Playwright sobre el Electron compilado: la CSP del `<meta>` no llegaba al worker de reconocimiento (una petición externa desde él no generaba ninguna infracción). Con la cabecera nueva, la misma petición se bloquea por `connect-src` y MediaPipe sigue cargando dentro del worker. Una segunda instancia con el mismo perfil sale sola.

**No verificado:**

- La tasa de acierto con webcam real. Quien probó no sabe LSC, así que cuando una seña no se reconoció no se sabe si falló el modelo o la seña estaba mal hecha. Para medirla hace falta una persona que signe LSC, con otras cámaras e iluminación. Con vídeos de LSC-54 de personas no vistas, el acierto es 0,86 en "Buenos días" y 0,81 en "Buenas tardes".
- Que el audio **se oiga** bien: se comprobó que la síntesis se activa, no la calidad del sonido.
- La ejecución del instalador NSIS (asistente, accesos directos y desinstalación).
- macOS y Linux, firma de código y auto-update (fuera de alcance).

## Decisiones de dependencias

- **Electron + electron-vite + React/TypeScript**: reutiliza la lógica TS del MVP móvil (cliente con refresh, stores, i18n). `@mediapipe/tasks-vision` corre sin código nativo en un Web Worker del renderer, para no bloquear la interfaz; detección de manos local y clasificación con una GRU global (entrenada en `training/`) ejecutada en TypeScript puro, sin runtimes de ML. Cada frame viaja al worker como `ImageBitmap` transferido y, si el worker sigue ocupado, se descarta. La voz se genera con las voces OneCore de Windows (WinRT vía PowerShell) y se envía con `setSinkId`.
- **Vite 7** (no 8) y **TypeScript 5.9**: son las versiones que admite electron-vite 5 y su tsconfig base.
- **react-router** con `HashRouter` (funciona igual bajo `app://` y en desarrollo), **Zustand**, **TanStack Query**, **react-hook-form + zod 4**.
- **Vitest** con dos proyectos (main en Node y renderer en jsdom). La lógica del main se escribe con dependencias inyectadas para testearla sin Electron.
- **Web Speech API** solo como respaldo fuera del Modo reunión, porque no permite elegir el dispositivo de salida. La voz normal es audio pregenerado con OneCore y reproducido con `setSinkId`.
- **`motion`** para las transiciones y el logo animado (respeta «reducir movimiento» de Windows), **`web-vitals`** para el INP del panel Diagnóstico y fuentes locales con **`@fontsource`** (Bricolage Grotesque y Atkinson Hyperlegible): la app no descarga nada al abrirse.
- Las dependencias del renderer son `devDependencies`: Vite las empaqueta, así que no entran en el `app.asar`.
- El **User-Agent se normaliza a ASCII** ("SenaVoz"), porque con la ñ del nombre Chromium rechazaba las subpeticiones de `app://` y la app empaquetada se quedaba en blanco.
- Textos de UI centralizados en `desktop/src/renderer/src/i18n` (solo `es`).

## Datos y licencia

El modelo de señas se entrena con **LSC-54**: Mora-Zarate, Garzón-Castro y Castellanos-Rivillas, *LSC-54: A landmark-based dataset for Colombian Sign Language*, Data in Brief 63 (2025) 112145. Dataset: <https://doi.org/10.57760/sciencedb.25639>, licencia **CC BY-NC 4.0** (uso no comercial, con atribución). El dataset no se versiona; la atribución también aparece en Ajustes › Créditos. Cómo descargarlo y entrenar: [training/README.md](training/README.md).
