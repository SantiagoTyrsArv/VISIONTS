# SeñaVoz

App móvil que traducirá señas comunes de reuniones a voz. **Este MVP** incluye: monorepo, autenticación completa (JWT con rotación de refresh tokens), catálogo de frases con reproducción de voz, y pantalla de cámara con permisos y un reconocedor de señas *simulado*. El reconocimiento real (MediaPipe + LSTM) queda para las fases 2–4 (ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

```
senavoz/
├── mobile/     # Expo SDK 57 + React Native + TypeScript (development build)
├── backend/    # FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
├── docker-compose.yml
└── docs/ARCHITECTURE.md
```

## Requisitos

| Para | Necesitas |
|---|---|
| Backend con Docker | Docker + Docker Compose |
| Backend sin Docker / tests | Python 3.12+ (Docker usa 3.12; los tests también pasan en 3.14) |
| Móvil | Node.js 20+ (probado con 24), npm |
| Dev build Android | Android Studio (SDK + emulador) o dispositivo con depuración USB, JDK 17 |
| Dev build iOS | **macOS** con Xcode (no es posible compilar iOS en Windows/Linux) |

## Backend

```bash
docker compose up --build
```

Levanta `db` (Postgres 17) y `api`; al arrancar, el contenedor ejecuta `alembic upgrade head` y el seed idempotente de frases. API en <http://localhost:8000> (docs interactivas en `/docs`).

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

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` | – | 201 + usuario (nunca el hash). Contraseña ≥ 8, letra y número |
| POST | `/auth/login` | – | `{access_token, refresh_token, token_type, expires_in}` |
| POST | `/auth/refresh` | – | Nuevo par; **rota** el refresh. Reutilizar uno ya rotado revoca todas las sesiones del usuario |
| POST | `/auth/logout` | – | 204; revoca ese refresh token (idempotente) |
| GET | `/users/me` | Bearer | Perfil |
| GET | `/phrases` | Bearer | Catálogo de frases |
| GET | `/health` | – | Liveness |

Access token: 15 min. Refresh token: 7 días, `secrets.token_urlsafe`, guardado como SHA-256. Rate limiting en login (5/min), register (10/min) y refresh (30/min) por IP.

### Variables de entorno (`backend/.env.example`)

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL SQLAlchemy (`postgresql+psycopg://...`) |
| `JWT_SECRET` | Secreto de firma, ≥ 32 caracteres. **Solo por entorno** |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | Vigencias (15 / 7) |
| `CORS_ORIGINS` | Orígenes permitidos separados por comas |
| `RATE_LIMIT_LOGIN` / `_REGISTER` / `_REFRESH` | Formato slowapi, p. ej. `5/minute` |

Nota: el límite de peticiones usa memoria del proceso; con varios workers/réplicas habría que moverlo a Redis.

## Móvil (development build, no Expo Go)

`expo-camera`, `expo-secure-store` y `expo-audio` incluyen código nativo, por eso se usa un *development build*.

```bash
cd mobile
npm install
cp .env.example .env     # ajusta EXPO_PUBLIC_API_URL (ver abajo)

npx expo run:android     # compila e instala el dev build (emulador o dispositivo USB)
npx expo run:ios         # solo en macOS con Xcode

npm start                # servidor Metro para el dev build ya instalado (expo start --dev-client)
```

También puedes compilar en la nube con EAS (requiere cuenta de Expo): `npx eas build:configure` y luego `npx eas build --profile development --platform android|ios` tras añadir `"developmentClient": true` al perfil `development` de `eas.json` (no incluido en este repo).

**`EXPO_PUBLIC_API_URL`** debe ser alcanzable desde el dispositivo:
- Emulador Android: `http://10.0.2.2:8000` (valor por defecto en Android)
- Simulador iOS: `http://localhost:8000` (valor por defecto en iOS)
- Dispositivo físico: `http://<IP-LAN-de-tu-PC>:8000` (mismo Wi‑Fi; permite el puerto 8000 en el firewall)

Las builds Android permiten tráfico HTTP en claro (`usesCleartextTraffic`, vía `expo-build-properties`) para desarrollo local. **Debe desactivarse y usarse HTTPS en producción.**

### Uso

1. Regístrate (te deja dentro) o inicia sesión.
2. **Frases**: toca una tarjeta y se reproduce en voz.
3. **Cámara**: concede el permiso; verás la cámara frontal con el texto "Reconocimiento de señas: próximamente". El botón de *Depuración* dispara una seña simulada (recorre las frases) y la reproduce en voz.
4. **Ajustes**: perfil, volumen y velocidad de voz (persisten en el dispositivo) y **Cerrar sesión** (revoca el refresh token en el servidor).

## Tests

```bash
# Backend (SQLite en memoria; no requiere Postgres)
cd backend && pytest

# Móvil
cd mobile
npm test              # Jest + React Native Testing Library
npm run typecheck     # tsc --noEmit
```

Backend (19 tests): registro, email duplicado, contraseñas débiles, login correcto/incorrecto (respuestas indistinguibles), rate limit, `/users/me` con y sin token, refresh con rotación, detección de reutilización, refresh expirado, logout, frases y seed idempotente.
Móvil (13 tests): pantalla de login (validación, normalización, errores), store de sesión (login, restore, logout que revoca) y cliente HTTP (un único refresh ante 401 concurrentes; cierre de sesión si el refresh falla).

## Qué se verificó y qué NO

**Verificado en esta máquina (Windows):**
- `docker compose up --build`: migraciones + seed automáticos, y flujo register → login → `/phrases` contra Postgres real.
- Tests del backend (19) y del móvil (13) en verde; `tsc --noEmit` sin errores.
- `expo export --platform android`: el bundle de Metro compila.

**No verificado (requiere dispositivo/emulador que no se usó aquí):**
- Ejecución del dev build en Android/iOS: permisos de cámara, preview frontal, audio de `expo-speech`, `expo-secure-store` reales. Los criterios "reabrir la app sin loguearme" y "tocar una tarjeta reproduce voz" están cubiertos por tests unitarios de la lógica, **pero no probados en un dispositivo real**.
- Build iOS (necesita macOS).
- La voz depende de que el dispositivo tenga una voz en español (`es-ES`) instalada.

## Decisiones de dependencias

- **Versiones de Expo/React Native**: se usan las que exige Expo SDK 57 (`react-native 0.86`, `react 19.2`, `typescript ~6.0`), no las últimas de npm (RN 0.87, TS 7): `expo install` fija las versiones compatibles con el SDK.
- **`expo-camera`** en lugar de `react-native-vision-camera` (compatible con SDK 57 y suficiente para el preview; Vision Camera se reevaluará en fase 2 si hace falta procesar frames).
- **`test-renderer`** en lugar de `react-test-renderer`: lo exige `@testing-library/react-native` 14.
- **PyJWT** (no python-jose); **psycopg 3**; **SQLAlchemy 2.1** con sesiones síncronas (suficiente para el MVP).
- Los tokens van solo en `expo-secure-store`; las preferencias de voz (no sensibles) en AsyncStorage.
- Textos de UI centralizados en `mobile/src/i18n` (solo `es`), listos para añadir otros idiomas.
