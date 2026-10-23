# Despliegue del backend en Neon y Render — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La API de SeñaVoz, desplegada en Render con la base de datos en Neon, se actualiza sola con cada push a `main` con CI en verde, y el instalador de escritorio habla con ella.

**Architecture:** GitHub Actions ejecuta los tests de `backend/`, `desktop/` y `training/`. Un Blueprint (`render.yaml`) define el web service Docker con auto-deploy tras los checks. La app toma la URL de producción de `desktop/.env.production` al compilar y tolera el arranque en frío de Render con un timeout de 60 s.

**Tech Stack:** GitHub Actions, Render Blueprint, Neon Postgres, FastAPI (Docker), Electron + Vite + axios.

**Spec:** `docs/superpowers/specs/2026-10-23-backend-deploy-design.md`

## Global Constraints

- Planes **gratuitos** de Neon y Render; nada que obligue a pagar.
- Región: Neon **AWS us-east-1**, Render **`virginia`**.
- Neon: cadena de conexión **directa** (sin `-pooler` en el host).
- Render: servicio `senavoz-api`, `runtime: docker`, `plan: free`, `healthCheckPath: /health`, rama `main`, `autoDeployTrigger: checksPass`.
- Variables: `DATABASE_URL` (`sync: false`, nunca versionada), `JWT_SECRET` (`generateValue: true`), `CORS_ORIGINS=app://senavoz`, `FORWARDED_ALLOW_IPS=*`.
- Timeout del cliente HTTP de la app: **60 000 ms**.
- Commits: el ejecutor hace commit y `git push` de la rama tras cada tarea (mensajes en español, prefijo convencional y la línea `Co-Authored-By` habitual). Ningún push a `main` sin que el usuario lo pida.
- Sin dependencias nuevas en la app ni en la API.

## Review Focus

1. **Primer login tras 15 min sin uso** (Render dormido, 30–60 s): debe funcionar, solo más lento. Test de timeout en la Tarea 1; prueba real en la Tarea 4.
2. **`DATABASE_URL` de Neon con `?sslmode=require&channel_binding=require`**: la API debe arrancar. La normalización ya tiene test (`backend/tests/test_config.py`); la Tarea 4 lo comprueba en los logs de Render.
3. **Push con un test roto**: el check debe quedar en rojo y Render no debe desplegar. Prueba en la Tarea 2 (rama desechable) y en la Tarea 4.
4. **Petición desde la app instalada** (origen `app://senavoz`): CORS debe permitirla y la CSP debe incluir la URL `https://…onrender.com`. Prueba en la Tarea 4.
5. **Secretos en el repo**: ni `DATABASE_URL` ni `JWT_SECRET` deben aparecer en `render.yaml`, `.env.production` ni en los logs de CI. Revisión en las Tareas 3 y 4.

---

### Task 1: Timeout de arranque en frío en el cliente HTTP

**Files:**
- Modify: `desktop/src/renderer/src/api/client.ts:8-11`
- Test: `desktop/src/renderer/src/__tests__/client.test.ts`

**Interfaces:**
- Produces: `export const REQUEST_TIMEOUT_MS = 60_000` en `client.ts`, usado por `http` y `bare`.

- [ ] **Step 1: Test que falla**

```ts
it('espera hasta 60 s: Render gratuito tarda en despertar', () => {
  expect(REQUEST_TIMEOUT_MS).toBe(60_000);
  expect(http.defaults.timeout).toBe(REQUEST_TIMEOUT_MS);
});
```

(Importar `http` y `REQUEST_TIMEOUT_MS` de `@/api/client`.)

- [ ] **Step 2:** `cd desktop; npx vitest run src/renderer/src/__tests__/client.test.ts` → FAIL (`REQUEST_TIMEOUT_MS` no existe).
- [ ] **Step 3:** En `client.ts`, declarar `REQUEST_TIMEOUT_MS` con un comentario de una línea (arranque en frío de Render, ver la spec) y usarlo en las dos llamadas a `axios.create`.
- [ ] **Step 4:** `npm test`, `npm run typecheck` y `npm run lint` → todo en verde, 0 avisos.
- [ ] **Step 5:** Commit `feat(desktop): esperar hasta 60 s a la API (arranque en frío de Render)` y push.

### Task 2: CI en GitHub Actions

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: tres checks llamados `backend`, `desktop` y `training`; Render (Tarea 3) espera a que pasen.

- [ ] **Step 1: Workflow**

- `on: push` (todas las ramas) y `pull_request`; `concurrency` por rama con `cancel-in-progress: true`.
- Job `backend` (`ubuntu-latest`, `working-directory: backend`): `actions/setup-python` 3.12 con `cache: pip` (`cache-dependency-path: backend/requirements*.txt`), `pip install -r requirements-dev.txt` y `pytest -q`. Variables: `JWT_SECRET` de prueba (≥ 32 caracteres, literal en el YAML: no es un secreto real) y `DATABASE_URL=sqlite://`.
- Job `desktop` (`ubuntu-latest`, `working-directory: desktop`): `actions/setup-node` 24 con `cache: npm` (`cache-dependency-path: desktop/package-lock.json`), `npm ci`, `npm run typecheck`, `npm run lint` y `npm test`. Si `npm ci` falla por `postinstall` (`electron-builder install-app-deps`), usar `npm ci --ignore-scripts`: los tests no necesitan módulos nativos.
- Job `training` (`ubuntu-latest`, `working-directory: training`): Python 3.12 con caché de pip (`training/requirements.txt`), `pip install -r requirements.txt` y `pytest -q`. Los tests no leen `training/data/`; si alguno lo necesita, debe saltarse sin la caché, no fallar.

- [ ] **Step 2:** Push de la rama y `gh run watch` → los tres jobs en verde. Si falla alguno, arreglar la causa (no saltarse el test) y repetir.
- [ ] **Step 3 (Review Focus 3):** En una rama desechable `ci/prueba-rojo`, añadir `assert False` a un test del backend, hacer push y comprobar con `gh run view` que `backend` queda en rojo. Borrar la rama local y remota.
- [ ] **Step 4:** Commit `ci: tests de backend, escritorio y training en GitHub Actions` y push.

### Task 3: Blueprint de Render

**Files:**
- Create: `render.yaml`

**Interfaces:**
- Consumes: el `backend/Dockerfile` y el `entrypoint.sh` actuales (migraciones y seed al arrancar, `$PORT`, `--proxy-headers`).

- [ ] **Step 1:** `render.yaml` con un único `services` de tipo `web`, con los valores de Global Constraints. Usar `rootDir: backend`, `dockerfilePath: ./Dockerfile` y `dockerContext: .`, y comprobar en la documentación de Blueprints de Render si estas rutas son relativas a `rootDir`. Sin `preDeployCommand`, porque no existe en el plan gratuito.
- [ ] **Step 2 (Review Focus 5):** `git grep -nE "neon.tech|postgresql://|JWT_SECRET: " -- render.yaml` → sin cadenas de conexión ni secretos.
- [ ] **Step 3:** Commit `build: Blueprint de Render para la API` y push.

### Task 4: Puesta en marcha, URL de producción y documentación

Los pasos marcados **(usuario)** los hace el autor con sus cuentas; el ejecutor le da las instrucciones exactas y espera su confirmación.

**Files:**
- Create: `desktop/.env.production`
- Modify: `README.md` (sección "Despliegue")

- [ ] **Step 1 (usuario):** Fusionar `feat/global-sign-model` en `main` (PR en GitHub) y hacer push.
- [ ] **Step 2 (usuario):** Neon → New project, región AWS us-east-1, Postgres 17. Copiar la cadena de conexión **directa**.
- [ ] **Step 3 (usuario):** Render → New → Blueprint → repo `SantiagoTyrsArv/VISIONTS` → pegar `DATABASE_URL` → Apply. Esperar al primer deploy.
- [ ] **Step 4:** `curl https://<servicio>.onrender.com/health` → `{"status":"ok"}`. En los logs de Render deben aparecer `alembic upgrade` y `Seed de frases`.
- [ ] **Step 5:** `desktop/.env.production` con `RENDERER_VITE_API_URL=https://<servicio>.onrender.com`, sin barra final. Comprobar que `desktop/.gitignore` no lo ignora.
- [ ] **Step 6:** `cd desktop; npm run build:win` → el instalador se genera. Este paso necesita `sign-model.json` del subproyecto 1. En `out/renderer/index.html`, la CSP debe contener la URL de Render (Review Focus 4).
- [ ] **Step 7 (usuario):** Instalar, registrarse, iniciar sesión, ver frases y decir una por clic. En Neon → Tables: `users` tiene el usuario y `phrases` tiene 20 filas.
- [ ] **Step 8 (usuario, Review Focus 1):** Tras 15 minutos sin uso, iniciar sesión de nuevo → funciona, aunque tarde.
- [ ] **Step 9 (Review Focus 3):** Un push a `main` con CI en verde despliega solo: en Render aparece un deploy nuevo con el hash del commit.
- [ ] **Step 10:** README, sección "Despliegue": arquitectura (Render + Neon + CI), URL del servicio, pasos 2–3 de esta tarea, cómo despertar la API antes de una demo (abrir `/health`) y qué se verificó en los pasos 4–9 (verificado / no verificado).
- [ ] **Step 11:** Commit `feat(desktop): URL de producción en Render` y `docs: despliegue en Neon y Render`, y push.
