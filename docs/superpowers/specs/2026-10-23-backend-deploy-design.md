# SeñaVoz — Despliegue del backend en Neon y Render

Fecha: 2026-10-23 · Estado: pendiente de aprobación

Subproyecto 2 de 2 del modelo global (el 1 es `2026-10-14-global-sign-model-design.md`).

## Objetivo

Que la API de SeñaVoz esté desplegada y funcione correctamente para la **presentación final de la materia**. En la demo, el autor usa la app de escritorio instalada en su PC contra la API en la nube (registro, login, frases y señas) y enseña el despliegue: el panel de Render (servicio en verde, logs), el de Neon (tablas, usuarios creados) y que un `git push` a `main` despliega solo.

Criterio de éxito: el instalador compilado habla con la API de Render, con la base de datos en Neon. Un push a `main` con los tests en verde se despliega sin intervención, y un push con tests en rojo no se despliega.

## Restricciones

- **Planes gratuitos** de Neon y Render, sin salir de ellos.
- Proyecto académico de alcance fijo: lo más simple que funcione, sin infraestructura pensada para crecer. Sin staging, dominio propio, monitorización ni Redis.
- El backend ya está preparado (commit `ceb5fc1`): normaliza la `DATABASE_URL` de Neon, escucha en `$PORT`, acepta `X-Forwarded-For` con `FORWARDED_ALLOW_IPS`, corre sin root y aplica migraciones y seed al arrancar.

## Diseño

### Base de datos: Neon

- Proyecto gratuito en la región **AWS us-east-1** (la más cercana a Render Virginia). *Decisión mía.*
- Se usa la cadena de conexión **directa** (sin el *pooler* de Neon): un solo proceso con su propio pool de SQLAlchemy no necesita PgBouncer, y Alembic requiere conexión directa. Así se evitan problemas de *prepared statements* de psycopg 3 con PgBouncer. *Decisión mía.*
- Neon suspende la base tras 5 minutos sin uso y despierta en segundos. `pool_pre_ping=True` (ya configurado) descarta las conexiones cortadas.

### API: Render, con Blueprint en el repo

Un `render.yaml` en la raíz describe el servicio, así que la configuración queda versionada y se puede enseñar. *Decisión mía.*

- Web service `senavoz-api`, `runtime: docker`, `rootDir: backend` (usa el `Dockerfile` actual), `plan: free`, región `virginia`, `healthCheckPath: /health`.
- **Auto-deploy solo si CI pasa**: rama `main` y `autoDeployTrigger: checksPass`.
- Variables de entorno:
  - `DATABASE_URL`: `sync: false`; el autor la pega desde Neon al crear el Blueprint y nunca se versiona.
  - `JWT_SECRET`: `generateValue: true` (Render genera un secreto aleatorio).
  - `CORS_ORIGINS=app://senavoz`.
  - `FORWARDED_ALLOW_IPS=*`: Render es el único camino de entrada.
- Un solo proceso uvicorn: el límite de peticiones en memoria sigue siendo válido.

### CI: GitHub Actions

`.github/workflows/ci.yml` se ejecuta en cada push y en cada PR, con tres jobs:

- **backend:** Python 3.12, `pip install -r requirements-dev.txt`, `pytest`.
- **desktop:** Node LTS en `ubuntu-latest`, `npm ci`, `typecheck`, `lint` y `test`. El test de síntesis con PowerShell ya se salta fuera de Windows (`describe.runIf(process.platform === 'win32')`). *Decisión mía.*
- **training:** Python 3.12, PyTorch CPU, `pytest`, con caché de pip por el tamaño de PyTorch.

Render espera a que todos los checks del commit pasen antes de desplegar.

### App de escritorio

- **`desktop/.env.production`** (versionado: la URL no es secreta) con `RENDERER_VITE_API_URL=https://<servicio>.onrender.com`. `npm run build:win` la toma automáticamente y la escribe en la CSP. El `.env` local sigue apuntando a `localhost` para desarrollo.
- **Arranque en frío:** Render gratuito duerme la API tras 15 minutos sin uso y tarda unos 30–60 s en despertar. Hoy el cliente corta a los 15 s, así que el primer login tras un rato fallaría. Se sube el `timeout` del cliente HTTP a **60 s**. Es lo mínimo que funciona; no se añade *keep-alive* ni pantalla nueva. *Decisión mía.* Antes de la demo, basta con abrir `/health` un minuto antes.

### Pasos manuales (los hace el autor, con su cuenta)

1. Fusionar `feat/global-sign-model` en `main`.
2. Neon: crear el proyecto y copiar la cadena de conexión directa.
3. Render: "New → Blueprint", conectar el repo de GitHub y pegar `DATABASE_URL`.
4. Escribir la URL del servicio en `desktop/.env.production` y compilar el instalador.

El plan los detalla paso a paso; el resto (archivos, tests, documentación) lo implementa el ejecutor.

## Verificación

- `GET https://<servicio>.onrender.com/health` responde `{"status":"ok"}`, y en los logs de Render aparecen las migraciones y el seed.
- Con el instalador: registro, login, lista de frases y una frase dicha por seña o por clic. En Neon aparecen las tablas `users` y `phrases` y el usuario creado.
- Tras 15 minutos sin uso, el primer login funciona, aunque tarde.
- Un push a `main` con tests en verde despliega solo. Una rama con un test roto deja el check en rojo y no se despliega en `main`.
- README: sección "Despliegue" con los pasos manuales y la URL.

## Fuera de alcance

Dominio propio, *keep-alive*, staging, monitorización y alertas, Redis, backups más allá de los de Neon, firma del instalador y auto-actualización de la app.
