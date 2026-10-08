# Modelo de señas entrenado por usuario — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada usuario grabe sus señas desde la app, el servidor entrene un modelo GRU con ellas y la app lo use en memoria para decir la frase reconocida en Cámara y en Modo reunión.

**Architecture:** La app graba ráfagas de 30 × 126 landmarks normalizados y las sube al momento (`POST /samples`), sin escribir nada en disco. Un servicio `trainer` del backend (PyTorch CPU) toma los entrenamientos en cola, entrena una GRU pequeña y guarda pesos y métricas en `sign_models`. La app descarga los pesos al iniciar sesión, los ejecuta con una GRU escrita en TypeScript puro (verificada contra PyTorch con un fixture) y los conecta al `SignClassifier` existente.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, PyTorch 2.14 CPU + NumPy 2.5 (solo `trainer`), pytest · Electron 44, React 19, TypeScript, Zustand, TanStack Query, axios, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-trained-sign-model-design.md`

## Global Constraints

- Backend en `backend/` (tests: `.venv/Scripts/python -m pytest` desde `backend/`); app en `desktop/` (comandos desde `desktop/`).
- **Nada personal en disco local:** la app no escribe muestras ni pesos (ni `localStorage`, ni archivos, ni caché HTTP). Los pesos se piden y se sirven con `Cache-Control: no-store`.
- **Sin runtimes de ML en la app:** prohibido añadir TF.js, ONNX Runtime u otras dependencias para inferir.
- La API (`app.main`) no importa `torch` ni `numpy`; solo `app.training.*` los importa.
- Muestra = exactamente **3.780** valores (`30 × 126`), finitos, con `|v| ≤ 2`; guardada como 3.780 `float32` little-endian (15.120 bytes).
- Etiqueta de reposo: **`neutral`**. Nunca produce frase ni voz.
- Mínimo para entrenar: **20** muestras de `neutral` y de al menos **2** frases. Tope: **100** muestras por etiqueta y usuario. Límite: **60/minuto** por usuario en `POST /samples`.
- Modelo: `GRU(126 → 64, 1 capa, batch_first)` → último estado → `Linear(64, n)`; formato de pesos **`senavoz-gru-v1`**; puertas en orden PyTorch (r, z, n).
- Entrenamiento: división estratificada 80/20 con semilla 0; Adam lr 1e‑3; lotes de 32; ≤ 150 épocas; paciencia 20; tope de **300 s**.
- Inferencia: umbral **0,8**, cooldown **1.200 ms**, una clasificación cada **3** frames; sondeo de estado cada **3 s** mientras se entrena.
- Ráfaga: cuenta atrás 3‑2‑1 (solo al empezar), 30 frames, pausa de 1 s, **5** ráfagas por sesión; se descarta una ráfaga con manos en menos de 15 de los 30 frames, salvo en `neutral`.
- Todo texto de UI va en `desktop/src/renderer/src/i18n/es.ts` y se lee con `t()`. Mensajes del backend en español.
- Comentarios en español, con la densidad del código existente.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Trabajo en la rama `feat/trained-sign-model` (crearla desde `main` antes de la Task 1).

## Review Focus

- **Se cae la red a mitad de una sesión de grabación:** la sesión se detiene, se ve el error y no queda nada guardado en local para reintentar. Test de pantalla con subida fallida (Task 9).
- **El último reentrenamiento falla pero existía un modelo listo:** la app sigue usando el modelo anterior y muestra el error del entrenamiento. Tests de `/models/status` (Task 3) y del store (Task 6).
- **Cerrar sesión mientras se sondea un entrenamiento:** no quedan pesos en memoria ni peticiones posteriores. Test del store (Task 6).
- **El modelo predice `neutral` con alta confianza:** no se dice nada. Test del store (Task 6).
- **Pesos con etiquetas y salida de distinto tamaño** (o un `format` desconocido): se rechazan con error de modelo, no se infiere basura. Test de `GruModel` (Task 5).

---

## Mapa de archivos

**Backend**
- `backend/app/db/models.py` — añade `SignSample` y `SignModel`.
- `backend/alembic/versions/0002_sign_models.py` — migración de las dos tablas.
- `backend/app/core/rate_limit.py` — clave de límite por usuario (`user_or_ip`).
- `backend/app/core/config.py` — `rate_limit_samples`.
- `backend/app/schemas/samples.py` — `SampleIn`, `SampleSummary`, esquemas de modelos.
- `backend/app/services/sample_service.py` — crear, contar y borrar muestras; etiquetas válidas.
- `backend/app/services/model_service.py` — encolar, estado, pesos, tomar, terminar, fallar, recuperar.
- `backend/app/api/samples.py`, `backend/app/api/models.py` — routers.
- `backend/app/main.py` — registra los routers.
- `backend/app/training/__init__.py`, `model.py` (GRU + export), `train.py` (entrenamiento), `data.py` (carga de muestras a NumPy), `worker.py` (bucle).
- `backend/scripts/export_gru_fixture.py` — genera el fixture de paridad para la app.
- `backend/requirements-train.txt`, `backend/requirements-dev.txt`, `backend/Dockerfile`, `docker-compose.yml`.
- Tests: `backend/tests/conftest.py` (helpers), `test_samples.py`, `test_training.py`, `test_models_api.py`, `test_worker.py`.

**App**
- `desktop/src/renderer/src/services/recognition/GruModel.ts` (+ test, + `__fixtures__/gru-parity.json`).
- `desktop/src/renderer/src/services/recognition/MediaPipeSignRecognizer.ts` — `setClassifier`, `onFrame`, paso de 3 frames, sin WASM no‑SIMD.
- `desktop/src/renderer/src/api/types.ts`, `api/endpoints.ts` — muestras y modelos.
- `desktop/src/renderer/src/store/signModel.ts` (+ test) — modelo en memoria y sondeo.
- `desktop/src/renderer/src/hooks/useSignRecognition.ts` — clasificador del store y frames.
- `desktop/src/renderer/src/services/training/burstRecorder.ts` (+ test) — lógica de ráfaga.
- `desktop/src/renderer/src/routes/Train.tsx`, `routes/train.module.css` (+ test) — pantalla Entrenar.
- `desktop/src/renderer/src/routes/settings/TrainingDataSection.tsx` — borrar todos los datos.
- `desktop/src/renderer/src/routes/Camera.tsx`, `routes/Meeting.tsx`, `routes/AppLayout.tsx`, `routes/Settings.tsx`, `App.tsx`, `ui/icons.tsx`, `i18n/es.ts`.
- `docs/ARCHITECTURE.md`, `README.md`.

---

### Task 1: Muestras en el backend (tablas, migración y endpoints)

**Files:**
- Modify: `backend/app/db/models.py`
- Create: `backend/alembic/versions/0002_sign_models.py`
- Modify: `backend/app/core/rate_limit.py`, `backend/app/core/config.py`
- Create: `backend/app/schemas/samples.py`, `backend/app/services/sample_service.py`, `backend/app/api/samples.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_samples.py`

**Interfaces:**
- Produces: modelos `SignSample(id, user_id, label, data: bytes, created_at)` y `SignModel(id, user_id, status, labels: list[str], weights: dict | None, metrics: dict | None, error: str | None, created_at, finished_at)`; constantes `sample_service.NEUTRAL = "neutral"`, `FRAME_VALUES = 3780`, `MIN_SAMPLES = 20`, `MAX_SAMPLES_PER_LABEL = 100`; funciones `sample_service.valid_labels(db) -> set[str]`, `sample_service.counts(db, user_id) -> dict[str, int]`; helpers de test `auth_headers(client, email) -> dict` y `add_samples(db, user_id, label, n)`.

- [ ] **Step 0: Crear la rama**

```bash
git checkout -b feat/trained-sign-model
```

- [ ] **Step 1: Helpers de test en `conftest.py`**

Añadir al final de `backend/tests/conftest.py`:

```python
def auth_headers(client, email: str) -> dict[str, str]:
    """Registra (si hace falta) e inicia sesión con otro usuario; devuelve la cabecera Bearer."""
    body = {"email": email, "password": "clave1234", "display_name": "Otro"}
    client.post("/auth/register", json=body)
    r = client.post("/auth/login", json={"email": email, "password": "clave1234"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture()
def auth(client, tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def add_samples(db, user_id, label: str, n: int) -> None:
    """Inserta n muestras válidas (todo ceros) directamente en la BD."""
    import struct

    from app.db.models import SignSample

    zeros = struct.pack("<3780f", *([0.0] * 3780))
    db.add_all(SignSample(user_id=user_id, label=label, data=zeros) for _ in range(n))
    db.commit()
```

- [ ] **Step 2: Escribir los tests de muestras**

Crear `backend/tests/test_samples.py`:

```python
import struct

from sqlalchemy import select

from app.db.models import SignModel, SignSample, User
from tests.conftest import USER, add_samples, auth_headers

FRAMES = [0.0] * 3780


def _user(db, email=USER["email"]):
    return db.scalar(select(User).where(User.email == email.lower()))


def test_requires_auth(client, seeded):
    assert client.post("/samples", json={"label": "yes", "frames": FRAMES}).status_code == 401
    assert client.get("/samples/summary").status_code == 401


def test_create_sample_stores_float32(client, auth, seeded, db_session):
    frames = [0.5] * 3780
    r = client.post("/samples", json={"label": "yes", "frames": frames}, headers=auth)
    assert r.status_code == 201
    row = db_session.scalar(select(SignSample))
    assert row.label == "yes"
    assert len(row.data) == 3780 * 4
    assert struct.unpack("<3780f", row.data)[0] == 0.5


def test_neutral_label_is_valid(client, auth, seeded):
    r = client.post("/samples", json={"label": "neutral", "frames": FRAMES}, headers=auth)
    assert r.status_code == 201


def test_unknown_label_rejected(client, auth, seeded):
    r = client.post("/samples", json={"label": "pizza", "frames": FRAMES}, headers=auth)
    assert r.status_code == 422


def test_wrong_length_rejected(client, auth, seeded):
    r = client.post("/samples", json={"label": "yes", "frames": [0.0] * 3779}, headers=auth)
    assert r.status_code == 422


def test_out_of_range_rejected(client, auth, seeded):
    frames = [0.0] * 3779 + [2.5]
    r = client.post("/samples", json={"label": "yes", "frames": frames}, headers=auth)
    assert r.status_code == 422


def test_non_finite_rejected(client, auth, seeded):
    body = '{"label": "yes", "frames": [' + ",".join(["0"] * 3779 + ["NaN"]) + "]}"
    headers = {**auth, "Content-Type": "application/json"}
    r = client.post("/samples", content=body, headers=headers)
    assert r.status_code == 422


def test_cap_per_label(client, auth, seeded, db_session):
    add_samples(db_session, _user(db_session).id, "yes", 100)
    r = client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    assert r.status_code == 409


def test_summary_counts_only_own_samples(client, auth, seeded, db_session):
    other = auth_headers(client, "otro@example.com")
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "no", "frames": FRAMES}, headers=other)
    assert client.get("/samples/summary", headers=auth).json() == {"counts": {"yes": 2}}
    assert client.get("/samples/summary", headers=other).json() == {"counts": {"no": 1}}


def test_delete_by_label_only_touches_own(client, auth, seeded, db_session):
    other = auth_headers(client, "otro@example.com")
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "no", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=other)
    assert client.delete("/samples", params={"label": "yes"}, headers=auth).status_code == 204
    assert client.get("/samples/summary", headers=auth).json() == {"counts": {"no": 1}}
    assert client.get("/samples/summary", headers=other).json() == {"counts": {"yes": 1}}


def test_delete_all_removes_samples_and_models(client, auth, seeded, db_session):
    user = _user(db_session)
    add_samples(db_session, user.id, "yes", 3)
    db_session.add(SignModel(user_id=user.id, status="ready", labels=["neutral", "yes"]))
    db_session.commit()
    assert client.delete("/samples", headers=auth).status_code == 204
    assert db_session.scalars(select(SignSample)).all() == []
    assert db_session.scalars(select(SignModel)).all() == []


def test_deleting_user_cascades(db_session, client, registered, seeded):
    user = _user(db_session)
    add_samples(db_session, user.id, "yes", 2)
    db_session.delete(user)
    db_session.commit()
    assert db_session.scalars(select(SignSample)).all() == []
```

> Nota: SQLite solo aplica `ON DELETE CASCADE` con `PRAGMA foreign_keys=ON`; el último test lo garantiza a nivel ORM con `cascade="all, delete-orphan"` en la relación `User.sign_samples` (ver Step 4).

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `cd backend && .venv/Scripts/python -m pytest tests/test_samples.py -q`
Expected: FAIL (`ImportError: cannot import name 'SignModel'`).

- [ ] **Step 4: Modelos**

En `backend/app/db/models.py`, cambiar los imports y añadir las clases:

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, LargeBinary, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship
```

Dentro de `class User`, tras `created_at`:

```python
    # Borrado en cascada también a nivel ORM (SQLite no aplica las FK por defecto).
    sign_samples: Mapped[list["SignSample"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    sign_models: Mapped[list["SignModel"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
```

Al final del archivo:

```python
class SignSample(Base):
    """Una ráfaga de 30 frames × 126 valores (float32 LE) grabada por el usuario."""

    __tablename__ = "sign_samples"
    __table_args__ = (Index("ix_sign_samples_user_label", "user_id", "label"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(50))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class SignModel(Base):
    """Un entrenamiento del modelo de señas de un usuario y, si termina bien, sus pesos."""

    __tablename__ = "sign_models"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    labels: Mapped[list[str]] = mapped_column(JSON)
    weights: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metrics: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 5: Migración**

Crear `backend/alembic/versions/0002_sign_models.py`:

```python
"""sign_samples y sign_models

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-07
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sign_samples",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sign_samples_user_id", "sign_samples", ["user_id"])
    op.create_index("ix_sign_samples_user_label", "sign_samples", ["user_id", "label"])

    op.create_table(
        "sign_models",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("labels", sa.JSON(), nullable=False),
        sa.Column("weights", sa.JSON(), nullable=True),
        sa.Column("metrics", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sign_models_user_id", "sign_models", ["user_id"])
    op.create_index("ix_sign_models_status", "sign_models", ["status"])


def downgrade() -> None:
    op.drop_table("sign_models")
    op.drop_table("sign_samples")
```

- [ ] **Step 6: Límite por usuario y ajuste**

`backend/app/core/rate_limit.py` completo:

```python
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.security import decode_access_token

limiter = Limiter(key_func=get_remote_address)


def user_or_ip(request: Request) -> str:
    """Clave de límite por usuario autenticado; sin token válido, por IP."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        sub = decode_access_token(auth[7:])
        if sub:
            return f"user:{sub}"
    return get_remote_address(request)
```

En `backend/app/core/config.py`, tras `rate_limit_refresh`:

```python
    rate_limit_samples: str = "60/minute"
```

- [ ] **Step 7: Esquemas**

Crear `backend/app/schemas/samples.py`:

```python
import math
import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

FRAME_VALUES = 30 * 126
MAX_ABS_VALUE = 2.0


class SampleIn(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    frames: list[float] = Field(min_length=FRAME_VALUES, max_length=FRAME_VALUES)

    @field_validator("frames")
    @classmethod
    def _finite_and_bounded(cls, v: list[float]) -> list[float]:
        if any(not math.isfinite(x) or abs(x) > MAX_ABS_VALUE for x in v):
            raise ValueError("Valores no válidos: deben ser finitos y estar entre -2 y 2")
        return v


class SampleCreated(BaseModel):
    id: uuid.UUID


class SampleSummary(BaseModel):
    counts: dict[str, int]


class ReadyModelOut(BaseModel):
    id: uuid.UUID
    labels: list[str]
    metrics: dict
    created_at: datetime


class ModelJobOut(BaseModel):
    id: uuid.UUID
    status: str
    error: str | None
    created_at: datetime


class ModelStatusOut(BaseModel):
    ready: ReadyModelOut | None
    latest: ModelJobOut | None
```

- [ ] **Step 8: Servicio de muestras**

Crear `backend/app/services/sample_service.py`:

```python
import struct
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import Phrase, SignModel, SignSample
from app.schemas.samples import FRAME_VALUES

NEUTRAL = "neutral"
MIN_SAMPLES = 20
MAX_SAMPLES_PER_LABEL = 100
_PACK = struct.Struct(f"<{FRAME_VALUES}f")


class UnknownLabel(Exception):
    pass


class LabelFull(Exception):
    pass


def valid_labels(db: Session) -> set[str]:
    """Códigos del catálogo más la clase de reposo."""
    return set(db.scalars(select(Phrase.code))) | {NEUTRAL}


def create_sample(db: Session, user_id: uuid.UUID, label: str, frames: list[float]) -> SignSample:
    if label not in valid_labels(db):
        raise UnknownLabel
    current = db.scalar(
        select(func.count())
        .select_from(SignSample)
        .where(SignSample.user_id == user_id, SignSample.label == label)
    )
    if (current or 0) >= MAX_SAMPLES_PER_LABEL:
        raise LabelFull
    sample = SignSample(user_id=user_id, label=label, data=_PACK.pack(*frames))
    db.add(sample)
    db.commit()
    return sample


def counts(db: Session, user_id: uuid.UUID) -> dict[str, int]:
    rows = db.execute(
        select(SignSample.label, func.count())
        .where(SignSample.user_id == user_id)
        .group_by(SignSample.label)
    ).all()
    return {label: n for label, n in rows}


def delete_samples(db: Session, user_id: uuid.UUID, label: str | None = None) -> None:
    """Sin etiqueta borra todo: muestras y modelos del usuario."""
    query = delete(SignSample).where(SignSample.user_id == user_id)
    if label is not None:
        query = query.where(SignSample.label == label)
    db.execute(query)
    if label is None:
        db.execute(delete(SignModel).where(SignModel.user_id == user_id))
    db.commit()
```

- [ ] **Step 9: Router**

Crear `backend/app/api/samples.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter, user_or_ip
from app.db.models import User
from app.db.session import get_db
from app.schemas.samples import SampleCreated, SampleIn, SampleSummary
from app.services import sample_service

router = APIRouter(prefix="/samples", tags=["samples"])
_settings = get_settings()


@router.post("", response_model=SampleCreated, status_code=status.HTTP_201_CREATED)
@limiter.limit(_settings.rate_limit_samples, key_func=user_or_ip)
def create_sample(
    request: Request,
    data: SampleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return sample_service.create_sample(db, user.id, data.label, data.frames)
    except sample_service.UnknownLabel:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Etiqueta desconocida")
    except sample_service.LabelFull:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya tienes 100 muestras de esta frase")


@router.get("/summary", response_model=SampleSummary)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"counts": sample_service.counts(db, user.id)}


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_samples(
    label: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sample_service.delete_samples(db, user.id, label)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

> Si la versión de Starlette no define `HTTP_422_UNPROCESSABLE_CONTENT`, usar `HTTP_422_UNPROCESSABLE_ENTITY` (mismo código 422).

En `backend/app/main.py`: `from app.api import auth, health, phrases, samples, users` y añadir `samples.router` a la tupla de routers.

- [ ] **Step 10: Ejecutar los tests**

Run: `.venv/Scripts/python -m pytest -q`
Expected: todo en verde (los 22 anteriores + 12 nuevos).

- [ ] **Step 11: Commit**

```bash
git add backend/app backend/alembic backend/tests
git commit -m "feat(backend): muestras de señas por usuario con validación, tope y borrado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Entrenamiento en PyTorch y fixture de paridad

**Files:**
- Create: `backend/requirements-train.txt`; Modify: `backend/requirements-dev.txt`
- Create: `backend/app/training/__init__.py`, `backend/app/training/model.py`, `backend/app/training/train.py`
- Create: `backend/scripts/export_gru_fixture.py`
- Create (generado): `desktop/src/renderer/src/services/recognition/__fixtures__/gru-parity.json`
- Test: `backend/tests/test_training.py`

**Interfaces:**
- Produces: `app.training.model.WEIGHTS_FORMAT = "senavoz-gru-v1"`, `SignGRU(n_labels, input_size=126, hidden_size=64)`, `export_weights(model, labels) -> dict`; `app.training.train.train_model(samples: dict[str, np.ndarray], *, hidden_size=64, max_epochs=150, patience=20, batch_size=32, lr=1e-3, seed=0, time_budget_s=300.0, clock=time.monotonic) -> TrainResult(weights: dict, metrics: dict)`, `TrainingTimeout(Exception)`. `metrics = {"val_accuracy": float, "per_label": {label: float}, "samples": {label: int}}`.
- Fixture JSON: `{"weights": <senavoz-gru-v1>, "input": number[3780], "probabilities": number[n]}`.

- [ ] **Step 1: Dependencias**

Crear `backend/requirements-train.txt`:

```
# Solo para el servicio trainer y los tests: la API no importa torch ni numpy.
--extra-index-url https://download.pytorch.org/whl/cpu
torch==2.14.1+cpu
numpy==2.5.3
```

`backend/requirements-dev.txt`:

```
-r requirements.txt
-r requirements-train.txt
pytest==9.1.1
httpx==0.28.1
```

Run: `.venv/Scripts/python -m pip install -r requirements-dev.txt`
Expected: instala `torch-2.14.1+cpu` y `numpy-2.5.3`.

- [ ] **Step 2: Tests de entrenamiento**

Crear `backend/tests/test_training.py`:

```python
import numpy as np
import pytest

from app.training.model import WEIGHTS_FORMAT
from app.training.train import TrainingTimeout, train_model


def _synthetic(seed=0, n=20):
    """Tres clases separables: mano izquierda arriba, abajo y reposo (ceros)."""
    rng = np.random.default_rng(seed)
    up = np.zeros((n, 30, 126), np.float32)
    up[:, :, :63] = 0.4
    down = np.zeros((n, 30, 126), np.float32)
    down[:, :, :63] = -0.4
    up += rng.normal(0, 0.02, up.shape).astype(np.float32)
    down += rng.normal(0, 0.02, down.shape).astype(np.float32)
    return {"yes": up, "no": down, "neutral": np.zeros((n, 30, 126), np.float32)}


def test_trains_separable_data():
    result = train_model(_synthetic(), hidden_size=16, max_epochs=40)
    assert result.metrics["val_accuracy"] >= 0.9
    assert set(result.metrics["per_label"]) == {"neutral", "no", "yes"}
    assert result.metrics["samples"] == {"neutral": 20, "no": 20, "yes": 20}


def test_weights_format_and_shapes():
    w = train_model(_synthetic(), hidden_size=16, max_epochs=2).weights
    assert w["format"] == WEIGHTS_FORMAT
    assert w["labels"] == ["neutral", "no", "yes"]
    assert (w["input_size"], w["hidden_size"]) == (126, 16)
    assert np.array(w["gru"]["weight_ih"]).shape == (48, 126)
    assert np.array(w["gru"]["weight_hh"]).shape == (48, 16)
    assert np.array(w["gru"]["bias_ih"]).shape == (48,)
    assert np.array(w["gru"]["bias_hh"]).shape == (48,)
    assert np.array(w["head"]["weight"]).shape == (3, 16)
    assert np.array(w["head"]["bias"]).shape == (3,)


def test_same_seed_same_result():
    a = train_model(_synthetic(), hidden_size=8, max_epochs=3)
    b = train_model(_synthetic(), hidden_size=8, max_epochs=3)
    assert a.weights == b.weights


def test_time_budget():
    ticks = iter(range(0, 10_000, 100))
    with pytest.raises(TrainingTimeout):
        train_model(_synthetic(), hidden_size=8, time_budget_s=150, clock=lambda: next(ticks))


def test_needs_two_labels():
    with pytest.raises(ValueError):
        train_model({"neutral": np.zeros((20, 30, 126), np.float32)})
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `.venv/Scripts/python -m pytest tests/test_training.py -q`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.training'`).

- [ ] **Step 4: Modelo y exportación**

Crear `backend/app/training/__init__.py` vacío y `backend/app/training/model.py`:

```python
import torch
from torch import nn

WEIGHTS_FORMAT = "senavoz-gru-v1"
INPUT_SIZE = 126


class SignGRU(nn.Module):
    """GRU de una capa sobre la secuencia; clasifica con el último estado oculto."""

    def __init__(self, n_labels: int, input_size: int = INPUT_SIZE, hidden_size: int = 64):
        super().__init__()
        self.gru = nn.GRU(input_size, hidden_size, batch_first=True)
        self.head = nn.Linear(hidden_size, n_labels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, h = self.gru(x)  # h: (1, lote, hidden)
        return self.head(h[-1])


def _tolist(t: torch.Tensor) -> list:
    return t.detach().cpu().numpy().tolist()


def export_weights(model: SignGRU, labels: list[str]) -> dict:
    """Pesos en JSON con la convención de PyTorch (puertas r, z, n); la app los ejecuta en TS."""
    g = model.gru
    return {
        "format": WEIGHTS_FORMAT,
        "input_size": g.input_size,
        "hidden_size": g.hidden_size,
        "labels": list(labels),
        "gru": {
            "weight_ih": _tolist(g.weight_ih_l0),
            "weight_hh": _tolist(g.weight_hh_l0),
            "bias_ih": _tolist(g.bias_ih_l0),
            "bias_hh": _tolist(g.bias_hh_l0),
        },
        "head": {"weight": _tolist(model.head.weight), "bias": _tolist(model.head.bias)},
    }
```

- [ ] **Step 5: Entrenamiento**

Crear `backend/app/training/train.py`:

```python
import copy
import math
import time
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import torch
from torch import nn

from app.training.model import SignGRU, export_weights

VAL_FRACTION = 0.2
MAX_SHIFT = 3


class TrainingTimeout(Exception):
    pass


@dataclass
class TrainResult:
    weights: dict
    metrics: dict


def _split(samples: dict[str, np.ndarray], labels: list[str], rng: np.random.Generator):
    """División estratificada: un 20 % de cada etiqueta (mínimo una muestra) a validación."""
    xs_tr, ys_tr, xs_va, ys_va = [], [], [], []
    for k, label in enumerate(labels):
        arr = samples[label]
        perm = rng.permutation(len(arr))
        n_val = max(1, round(len(arr) * VAL_FRACTION))
        xs_va.append(arr[perm[:n_val]])
        xs_tr.append(arr[perm[n_val:]])
        ys_va.append(np.full(n_val, k, np.int64))
        ys_tr.append(np.full(len(arr) - n_val, k, np.int64))
    return (
        np.concatenate(xs_tr).astype(np.float32),
        np.concatenate(ys_tr),
        np.concatenate(xs_va).astype(np.float32),
        np.concatenate(ys_va),
    )


def augment(batch: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Escala 0,9–1,1, ruido σ=0,01 (sin tocar manos ausentes) y desplazamiento de ±3 frames."""
    out = batch.copy()
    present = out != 0
    out *= rng.uniform(0.9, 1.1, size=(len(out), 1, 1)).astype(np.float32)
    out += rng.normal(0, 0.01, size=out.shape).astype(np.float32) * present
    for i in range(len(out)):
        s = int(rng.integers(-MAX_SHIFT, MAX_SHIFT + 1))
        if s > 0:
            out[i] = np.concatenate([np.repeat(out[i][:1], s, 0), out[i][:-s]])
        elif s < 0:
            out[i] = np.concatenate([out[i][-s:], np.repeat(out[i][-1:], -s, 0)])
    return out


def train_model(
    samples: dict[str, np.ndarray],
    *,
    hidden_size: int = 64,
    max_epochs: int = 150,
    patience: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    seed: int = 0,
    time_budget_s: float = 300.0,
    clock: Callable[[], float] = time.monotonic,
) -> TrainResult:
    labels = sorted(samples)
    if len(labels) < 2:
        raise ValueError("Se necesitan al menos dos etiquetas para entrenar")
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)
    x_tr, y_tr, x_va, y_va = _split(samples, labels, rng)
    xv, yv = torch.from_numpy(x_va), torch.from_numpy(y_va)

    model = SignGRU(len(labels), hidden_size=hidden_size)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    start = clock()
    best_loss, best_state, stale = math.inf, copy.deepcopy(model.state_dict()), 0

    for _ in range(max_epochs):
        model.train()
        order = rng.permutation(len(x_tr))
        for i in range(0, len(order), batch_size):
            idx = order[i : i + batch_size]
            xb = torch.from_numpy(augment(x_tr[idx], rng))
            yb = torch.from_numpy(y_tr[idx])
            optimizer.zero_grad()
            loss_fn(model(xb), yb).backward()
            optimizer.step()
            if clock() - start > time_budget_s:
                raise TrainingTimeout("El entrenamiento superó el tiempo máximo")
        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(xv), yv).item()
        if val_loss < best_loss - 1e-6:
            best_loss, best_state, stale = val_loss, copy.deepcopy(model.state_dict()), 0
        else:
            stale += 1
            if stale >= patience:
                break

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        pred = model(xv).argmax(dim=1).numpy()
    per_label = {
        label: round(float((pred[y_va == k] == k).mean()), 4) for k, label in enumerate(labels)
    }
    metrics = {
        "val_accuracy": round(float((pred == y_va).mean()), 4),
        "per_label": per_label,
        "samples": {label: int(len(samples[label])) for label in labels},
    }
    return TrainResult(weights=export_weights(model, labels), metrics=metrics)
```

- [ ] **Step 6: Ejecutar los tests**

Run: `.venv/Scripts/python -m pytest tests/test_training.py -q`
Expected: 5 passed.

- [ ] **Step 7: Script del fixture de paridad**

Crear `backend/scripts/export_gru_fixture.py`:

```python
"""Genera el fixture que comprueba que la GRU en TypeScript calcula igual que PyTorch.

Uso (desde backend/): python -m scripts.export_gru_fixture
"""

import json
from pathlib import Path

import numpy as np
import torch

from app.training.model import SignGRU, export_weights

OUT = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/src/services/recognition/__fixtures__/gru-parity.json"
)


def main() -> None:
    torch.manual_seed(0)
    labels = ["agree", "neutral", "thanks"]
    # hidden_size pequeño para que el fixture pese poco; la app admite cualquier tamaño.
    model = SignGRU(len(labels), hidden_size=8).eval()
    rng = np.random.default_rng(0)
    x = rng.uniform(-0.5, 0.5, size=(30, 126)).astype(np.float32)
    with torch.no_grad():
        probs = torch.softmax(model(torch.from_numpy(x)[None]), dim=1)[0].numpy()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "weights": export_weights(model, labels),
                "input": x.reshape(-1).tolist(),
                "probabilities": probs.tolist(),
            }
        ),
        encoding="utf-8",
    )
    print(f"Fixture escrito en {OUT}")


if __name__ == "__main__":
    main()
```

Run: `.venv/Scripts/python -m scripts.export_gru_fixture`
Expected: "Fixture escrito en …/__fixtures__/gru-parity.json" (unos 100 KB).

- [ ] **Step 8: Commit**

```bash
git add backend/requirements-train.txt backend/requirements-dev.txt backend/app/training backend/scripts/export_gru_fixture.py backend/tests/test_training.py desktop/src/renderer/src/services/recognition/__fixtures__/gru-parity.json
git commit -m "feat(backend): entrenamiento GRU en PyTorch y fixture de paridad para la app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Endpoints de modelos, worker y servicio `trainer`

**Files:**
- Create: `backend/app/services/model_service.py`, `backend/app/api/models.py`
- Create: `backend/app/training/data.py`, `backend/app/training/worker.py`
- Modify: `backend/app/main.py`, `backend/Dockerfile`, `docker-compose.yml`
- Test: `backend/tests/test_models_api.py`, `backend/tests/test_worker.py`

**Interfaces:**
- Consumes: `sample_service.counts`, `valid_labels`, `NEUTRAL`, `MIN_SAMPLES` (Task 1); `train_model`, `TrainResult` (Task 2).
- Produces: `model_service.enqueue(db, user_id) -> SignModel` (lanza `TrainingInProgress`, `NotEnoughSamples(missing: list[str])`), `status(db, user_id) -> dict`, `ready_weights(db, user_id) -> dict | None`, `claim_next(db) -> SignModel | None`, `finish(db, job, weights, metrics)`, `fail(db, job_id, message)`, `recover_interrupted(db) -> int`; `worker.run_once(db, train_fn) -> bool`; `data.load_training_set(db, user_id, labels) -> dict[str, np.ndarray]`.
- HTTP: `POST /models/train` → 202 `{id, status}`; `GET /models/status` → `{ready, latest}`; `GET /models/ready/weights` → JSON `senavoz-gru-v1`.

- [ ] **Step 1: Tests de la API de modelos**

Crear `backend/tests/test_models_api.py`:

```python
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.models import SignModel, User
from tests.conftest import USER, add_samples, auth_headers


def _user(db):
    return db.scalar(select(User).where(User.email == USER["email"].lower()))


def _enough(db, user_id, labels=("neutral", "yes", "no")):
    for label in labels:
        add_samples(db, user_id, label, 20)


def test_train_requires_enough_samples(client, auth, seeded, db_session):
    add_samples(db_session, _user(db_session).id, "neutral", 20)
    add_samples(db_session, _user(db_session).id, "yes", 20)
    add_samples(db_session, _user(db_session).id, "no", 19)
    r = client.post("/models/train", headers=auth)
    assert r.status_code == 422
    assert "Faltan muestras" in r.json()["detail"]


def test_train_requires_neutral(client, auth, seeded, db_session):
    _enough(db_session, _user(db_session).id, labels=("yes", "no", "thanks"))
    assert client.post("/models/train", headers=auth).status_code == 422


def test_train_enqueues_labels_with_enough_samples(client, auth, seeded, db_session):
    user = _user(db_session)
    _enough(db_session, user.id)
    add_samples(db_session, user.id, "thanks", 5)  # por debajo del mínimo: no entra
    r = client.post("/models/train", headers=auth)
    assert r.status_code == 202
    assert r.json()["status"] == "queued"
    job = db_session.scalar(select(SignModel))
    assert job.labels == ["neutral", "no", "yes"]


def test_train_conflict_while_running(client, auth, seeded, db_session):
    _enough(db_session, _user(db_session).id)
    assert client.post("/models/train", headers=auth).status_code == 202
    assert client.post("/models/train", headers=auth).status_code == 409


def test_status_empty(client, auth):
    assert client.get("/models/status", headers=auth).json() == {"ready": None, "latest": None}


def test_status_keeps_ready_model_when_retrain_fails(client, auth, db_session):
    user = _user(db_session)
    now = datetime.now(timezone.utc)
    ready = SignModel(
        user_id=user.id, status="ready", labels=["neutral", "yes"],
        weights={"format": "senavoz-gru-v1"}, metrics={"val_accuracy": 0.9},
        created_at=now - timedelta(minutes=5),
    )
    failed = SignModel(
        user_id=user.id, status="failed", labels=["neutral", "yes"],
        error="Entrenamiento interrumpido", created_at=now,
    )
    db_session.add_all([ready, failed])
    db_session.commit()
    body = client.get("/models/status", headers=auth).json()
    assert body["ready"]["id"] == str(ready.id)
    assert body["ready"]["metrics"] == {"val_accuracy": 0.9}
    assert body["latest"]["status"] == "failed"
    assert body["latest"]["error"] == "Entrenamiento interrumpido"


def test_status_hides_jobs_older_than_ready(client, auth, db_session):
    user = _user(db_session)
    now = datetime.now(timezone.utc)
    db_session.add_all([
        SignModel(user_id=user.id, status="failed", labels=["a"], created_at=now - timedelta(1)),
        SignModel(user_id=user.id, status="ready", labels=["a"], metrics={}, created_at=now),
    ])
    db_session.commit()
    assert client.get("/models/status", headers=auth).json()["latest"] is None


def test_weights_no_store_and_isolated(client, auth, db_session):
    user = _user(db_session)
    weights = {"format": "senavoz-gru-v1", "labels": ["neutral", "yes"]}
    db_session.add(SignModel(user_id=user.id, status="ready", labels=["neutral", "yes"],
                             weights=weights, metrics={}))
    db_session.commit()
    r = client.get("/models/ready/weights", headers=auth)
    assert r.status_code == 200
    assert r.json() == weights
    assert r.headers["cache-control"] == "no-store"
    other = auth_headers(client, "otro@example.com")
    assert client.get("/models/ready/weights", headers=other).status_code == 404
    assert client.get("/models/status", headers=other).json() == {"ready": None, "latest": None}
```

- [ ] **Step 2: Tests del worker**

Crear `backend/tests/test_worker.py`:

```python
from sqlalchemy import select

from app.db.models import SignModel, User
from app.services import model_service
from app.training.train import TrainResult
from app.training.worker import run_once
from tests.conftest import USER, add_samples


def _user(db):
    return db.scalar(select(User).where(User.email == USER["email"].lower()))


def _queue(db, labels=("neutral", "yes")):
    user = _user(db)
    for label in labels:
        add_samples(db, user.id, label, 20)
    job = SignModel(user_id=user.id, status="queued", labels=list(labels))
    db.add(job)
    db.commit()
    return job


def test_run_once_without_jobs(db_session):
    assert run_once(db_session, train_fn=lambda s: None) is False


def test_run_once_trains_and_marks_ready(db_session, registered, client):
    job = _queue(db_session)
    seen = {}

    def fake_train(samples):
        seen.update({k: v.shape for k, v in samples.items()})
        return TrainResult(weights={"format": "senavoz-gru-v1"}, metrics={"val_accuracy": 1.0})

    assert run_once(db_session, train_fn=fake_train) is True
    db_session.refresh(job)
    assert job.status == "ready"
    assert job.weights == {"format": "senavoz-gru-v1"}
    assert job.finished_at is not None
    assert seen == {"neutral": (20, 30, 126), "yes": (20, 30, 126)}


def test_new_ready_model_replaces_previous(db_session, registered, client):
    user = _user(db_session)
    old = SignModel(user_id=user.id, status="ready", labels=["neutral", "yes"], metrics={})
    db_session.add(old)
    db_session.commit()
    _queue(db_session)
    run_once(db_session, train_fn=lambda s: TrainResult(weights={}, metrics={}))
    statuses = [m.status for m in db_session.scalars(select(SignModel))]
    assert statuses == ["ready"]


def test_run_once_marks_failed_on_error(db_session, registered, client):
    job = _queue(db_session)

    def boom(samples):
        raise RuntimeError("sin memoria")

    assert run_once(db_session, train_fn=boom) is True
    db_session.refresh(job)
    assert job.status == "failed"
    assert job.error == "No se pudo entrenar el modelo: sin memoria"


def test_recover_interrupted(db_session, registered, client):
    job = _queue(db_session)
    job.status = "training"
    db_session.commit()
    assert model_service.recover_interrupted(db_session) == 1
    db_session.refresh(job)
    assert (job.status, job.error) == ("failed", "Entrenamiento interrumpido")
```

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `.venv/Scripts/python -m pytest tests/test_models_api.py tests/test_worker.py -q`
Expected: FAIL (`ModuleNotFoundError: No module named 'app.services.model_service'`).

- [ ] **Step 4: Servicio de modelos**

Crear `backend/app/services/model_service.py`:

```python
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.db.models import SignModel
from app.services.sample_service import MIN_SAMPLES, NEUTRAL, counts, valid_labels

ACTIVE = ("queued", "training")


class TrainingInProgress(Exception):
    pass


class NotEnoughSamples(Exception):
    def __init__(self, missing: list[str]):
        self.missing = missing


def _now() -> datetime:
    return datetime.now(timezone.utc)


def enqueue(db: Session, user_id: uuid.UUID) -> SignModel:
    """Pone en cola un entrenamiento con las etiquetas que llegan al mínimo de muestras."""
    active = db.scalar(
        select(SignModel).where(SignModel.user_id == user_id, SignModel.status.in_(ACTIVE))
    )
    if active is not None:
        raise TrainingInProgress
    allowed = valid_labels(db)
    enough = sorted(
        label for label, n in counts(db, user_id).items() if n >= MIN_SAMPLES and label in allowed
    )
    phrases = [label for label in enough if label != NEUTRAL]
    missing = ([] if NEUTRAL in enough else [NEUTRAL]) + (
        [] if len(phrases) >= 2 else ["2 frases"]
    )
    if missing:
        raise NotEnoughSamples(missing)
    job = SignModel(user_id=user_id, status="queued", labels=enough)
    db.add(job)
    db.commit()
    return job


def _ready(db: Session, user_id: uuid.UUID) -> SignModel | None:
    return db.scalar(
        select(SignModel)
        .where(SignModel.user_id == user_id, SignModel.status == "ready")
        .order_by(SignModel.created_at.desc())
        .limit(1)
    )


def status(db: Session, user_id: uuid.UUID) -> dict:
    """El último modelo listo y el entrenamiento más reciente posterior a él."""
    ready = _ready(db, user_id)
    query = select(SignModel).where(SignModel.user_id == user_id, SignModel.status != "ready")
    if ready is not None:
        query = query.where(SignModel.created_at > ready.created_at)
    latest = db.scalar(query.order_by(SignModel.created_at.desc()).limit(1))
    return {
        "ready": None
        if ready is None
        else {
            "id": ready.id,
            "labels": ready.labels,
            "metrics": ready.metrics or {},
            "created_at": ready.created_at,
        },
        "latest": None
        if latest is None
        else {
            "id": latest.id,
            "status": latest.status,
            "error": latest.error,
            "created_at": latest.created_at,
        },
    }


def ready_weights(db: Session, user_id: uuid.UUID) -> dict | None:
    ready = _ready(db, user_id)
    return None if ready is None else ready.weights


def claim_next(db: Session) -> SignModel | None:
    """Toma el trabajo en cola más antiguo; SKIP LOCKED permite varios workers."""
    job = db.scalar(
        select(SignModel)
        .where(SignModel.status == "queued")
        .order_by(SignModel.created_at)
        .limit(1)
        .with_for_update(skip_locked=True)
    )
    if job is None:
        db.rollback()
        return None
    job.status = "training"
    db.commit()
    return job


def finish(db: Session, job: SignModel, weights: dict, metrics: dict) -> None:
    job.status, job.weights, job.metrics, job.finished_at = "ready", weights, metrics, _now()
    # Solo se conserva el modelo nuevo: los anteriores (listos o fallidos) sobran.
    db.execute(
        delete(SignModel).where(
            SignModel.user_id == job.user_id,
            SignModel.id != job.id,
            SignModel.status.in_(("ready", "failed")),
        )
    )
    db.commit()


def fail(db: Session, job_id: uuid.UUID, message: str) -> None:
    db.execute(
        update(SignModel)
        .where(SignModel.id == job_id)
        .values(status="failed", error=message, finished_at=_now())
    )
    db.commit()


def recover_interrupted(db: Session) -> int:
    """Al arrancar el worker, lo que quedó en `training` ya no avanzará."""
    result = db.execute(
        update(SignModel)
        .where(SignModel.status == "training")
        .values(status="failed", error="Entrenamiento interrumpido", finished_at=_now())
    )
    db.commit()
    return result.rowcount
```

- [ ] **Step 5: Router de modelos**

Crear `backend/app/api/models.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.samples import ModelStatusOut
from app.services import model_service

router = APIRouter(prefix="/models", tags=["models"])


@router.post("/train", status_code=status.HTTP_202_ACCEPTED)
def train(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        job = model_service.enqueue(db, user.id)
    except model_service.TrainingInProgress:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay un entrenamiento en curso")
    except model_service.NotEnoughSamples as e:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Faltan muestras: " + ", ".join(e.missing),
        )
    return {"id": str(job.id), "status": job.status}


@router.get("/status", response_model=ModelStatusOut)
def model_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return model_service.status(db, user.id)


@router.get("/ready/weights")
def ready_weights(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    weights = model_service.ready_weights(db, user.id)
    if weights is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay ningún modelo listo")
    # Pesos derivados de los datos de la persona: que nadie los guarde en caché.
    return JSONResponse(weights, headers={"Cache-Control": "no-store"})
```

En `backend/app/main.py`: importar `models` desde `app.api` (`from app.api import auth, health, models, phrases, samples, users`) y añadir `models.router` a la tupla.

- [ ] **Step 6: Carga de datos y worker**

Crear `backend/app/training/data.py`:

```python
import uuid

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SignSample


def load_training_set(db: Session, user_id: uuid.UUID, labels: list[str]) -> dict[str, np.ndarray]:
    """Muestras del usuario agrupadas por etiqueta, con forma (n, 30, 126)."""
    rows = db.execute(
        select(SignSample.label, SignSample.data).where(
            SignSample.user_id == user_id, SignSample.label.in_(labels)
        )
    ).all()
    grouped: dict[str, list[np.ndarray]] = {label: [] for label in labels}
    for label, data in rows:
        grouped[label].append(np.frombuffer(data, dtype="<f4").reshape(30, 126))
    return {label: np.stack(v).astype(np.float32) for label, v in grouped.items() if v}
```

Crear `backend/app/training/worker.py`:

```python
"""Servicio trainer: entrena los modelos en cola. Uso: python -m app.training.worker"""

import logging
import time
from collections.abc import Callable

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.services import model_service
from app.training.data import load_training_set

log = logging.getLogger("senavoz.trainer")
POLL_SECONDS = 3


def _default_train(samples):
    from app.training.train import train_model

    return train_model(samples)


def run_once(db: Session, train_fn: Callable = _default_train) -> bool:
    """Procesa un trabajo si lo hay. Devuelve False si la cola estaba vacía."""
    job = model_service.claim_next(db)
    if job is None:
        return False
    job_id, user_id, labels = job.id, job.user_id, list(job.labels)
    log.info("Entrenando modelo %s (%s)", job_id, ", ".join(labels))
    try:
        result = train_fn(load_training_set(db, user_id, labels))
        model_service.finish(db, job, result.weights, result.metrics)
        log.info("Modelo %s listo", job_id)
    except Exception as e:  # cualquier fallo deja el trabajo en `failed`, nunca colgado
        db.rollback()
        log.exception("Falló el entrenamiento %s", job_id)
        model_service.fail(db, job_id, f"No se pudo entrenar el modelo: {e}")
    return True


def main() -> None:
    from app.db.session import SessionLocal

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    recovered = False
    while True:
        try:
            with SessionLocal() as db:
                if not recovered:
                    n = model_service.recover_interrupted(db)
                    recovered = True
                    if n:
                        log.warning("%d entrenamientos interrumpidos marcados como fallidos", n)
                if run_once(db):
                    continue
        except SQLAlchemyError:
            # Base de datos aún sin migrar o no disponible: se reintenta.
            log.exception("Error de base de datos; reintentando")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Ejecutar los tests**

Run: `.venv/Scripts/python -m pytest -q`
Expected: todo en verde.

- [ ] **Step 8: Docker**

`backend/Dockerfile`: sustituir las dos líneas de dependencias por:

```dockerfile
COPY requirements.txt requirements-train.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-train.txt
```

En `docker-compose.yml`, tras el servicio `api` (antes de `volumes:`):

```yaml
  trainer:
    build: ./backend
    command: ["python", "-m", "app.training.worker"]
    # La API aplica las migraciones al arrancar; el worker reintenta hasta que existan las tablas.
    env_file:
      - ./backend/.env.example
    environment:
      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-senavoz}:${POSTGRES_PASSWORD:-senavoz}@db:5432/${POSTGRES_DB:-senavoz}
      JWT_SECRET: ${JWT_SECRET:-dev-only-change-me-dev-only-change-me}
    depends_on:
      db:
        condition: service_healthy
      api:
        condition: service_started
    restart: unless-stopped
```

Run: `docker compose up --build -d && docker compose logs trainer --tail 20`
Expected: el `trainer` arranca sin errores tras aplicarse la migración `0002` en `api`. (Si Docker no está disponible, anotarlo y seguir; se verifica en la Task 11.)

- [ ] **Step 9: Commit**

```bash
git add backend docker-compose.yml
git commit -m "feat(backend): entrenamientos en cola, estado y pesos del modelo, y servicio trainer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Reconocedor con clasificador intercambiable, frames y menos peso

**Files:**
- Modify: `desktop/src/renderer/src/services/recognition/MediaPipeSignRecognizer.ts`
- Modify: `desktop/src/renderer/src/services/recognition/SignRecognizer.ts`
- Delete: `desktop/src/renderer/src/services/recognition/MockSignRecognizer.ts` (ya no lo usa nadie)
- Test: `desktop/src/renderer/src/services/recognition/MediaPipeSignRecognizer.test.ts`

**Interfaces:**
- Produces: `type LandmarkFrame = { values: number[]; handsDetected: boolean }` (en `SignRecognizer.ts`); métodos `MediaPipeSignRecognizer.setClassifier(classifier: SignClassifier | null): void` y `onFrame(callback: (frame: LandmarkFrame) => void): Unsubscribe`; constante `INFERENCE_STRIDE = 3`.

- [ ] **Step 1: Tests nuevos**

Añadir al `describe` de `MediaPipeSignRecognizer.test.ts` (y añadir `import type { LandmarkFrame } from './SignRecognizer';` junto a los imports):

```ts
  it('emite cada frame normalizado con si hay manos', async () => {
    const frames: LandmarkFrame[] = [];
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
    });
    recognizer.onFrame((f) => frames.push(f));
    await recognizer.start();
    h.advance(10);
    h.advance(20);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ values: Array(126).fill(0), handsDetected: false });
  });

  it('clasifica una vez cada 3 frames con el buffer lleno', async () => {
    const classifier: SignClassifier = { classify: vi.fn().mockResolvedValue(null) };
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier,
    });
    await recognizer.start();
    for (let i = 0; i < 36; i += 1) {
      h.advance(100 + i);
      await Promise.resolve();
      await Promise.resolve();
    }
    // Frames 30, 33 y 36.
    expect(classifier.classify).toHaveBeenCalledTimes(3);
  });

  it('cambia de clasificador sin reiniciar la cámara y lo refleja en el estado', async () => {
    const onStatus = vi.fn();
    const classifier: SignClassifier = {
      classify: vi.fn().mockResolvedValue({ code: 'yes', confidence: 0.95 }),
    };
    const onSign = vi.fn();
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
    });
    recognizer.onStatus(onStatus);
    recognizer.onSign(onSign);
    await recognizer.start();

    recognizer.setClassifier(classifier);
    expect(onStatus).toHaveBeenLastCalledWith({
      phase: 'ready',
      handsDetected: false,
      modelAvailable: true,
    });
    for (let i = 0; i < 30; i += 1) {
      h.advance(100 + i);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(onSign).toHaveBeenCalledWith({ code: 'yes', confidence: 0.95 });
    expect(h.landmarker.close).not.toHaveBeenCalled();

    recognizer.setClassifier(null);
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelAvailable: false }),
    );
  });
```

- [ ] **Step 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/renderer/src/services/recognition/MediaPipeSignRecognizer.test.ts`
Expected: FAIL (`recognizer.onFrame is not a function`).

- [ ] **Step 3: Tipo de frame**

En `SignRecognizer.ts`, tras `RecognitionStatus`:

```ts
/** Frame normalizado (126 valores) tal como lo ve el clasificador. */
export type LandmarkFrame = { values: number[]; handsDetected: boolean };
```

- [ ] **Step 4: Implementación**

En `MediaPipeSignRecognizer.ts`:

1. Quitar los imports `noSimdLoaderUrl` y `noSimdWasmUrl` y sustituir `createDefaultLandmarker` por:

```ts
// Solo se empaqueta el WASM con SIMD: cualquier PC con Windows 10/11 x64 lo admite.
async function createDefaultLandmarker(): Promise<Landmarker> {
  const modelAssetPath = new URL('/models/hand_landmarker.task', window.location.href).toString();
  return HandLandmarker.createFromOptions(
    { wasmLoaderPath: simdLoaderUrl, wasmBinaryPath: simdWasmUrl },
    { baseOptions: { modelAssetPath }, runningMode: 'VIDEO', numHands: 2 },
  );
}
```

y quitar `FilesetResolver` del import de `@mediapipe/tasks-vision`.

2. Añadir `LandmarkFrame` al import de `./SignRecognizer` y, tras `type FrameCallback`, la constante:

```ts
/** Se clasifica uno de cada 3 frames para no cargar la CPU durante las reuniones. */
export const INFERENCE_STRIDE = 3;
```

3. En la clase: `classifier` deja de ser `readonly` (`private classifier: SignClassifier | null;`), y se añaden los campos:

```ts
  private readonly frameListeners = new Set<(frame: LandmarkFrame) => void>();
  private framesSinceInference = INFERENCE_STRIDE;
```

4. En `start()`, tras `this.previousTimestamp = -1;`: `this.framesSinceInference = INFERENCE_STRIDE;`

5. Métodos nuevos (tras `onStatus`):

```ts
  /** Cambia el modelo sin reiniciar la cámara (p. ej. al terminar un entrenamiento). */
  setClassifier(classifier: SignClassifier | null): void {
    this.classifier = classifier;
    this.publishStatus({ ...this.status, modelAvailable: !!classifier });
  }

  onFrame(callback: (frame: LandmarkFrame) => void): Unsubscribe {
    this.frameListeners.add(callback);
    return () => this.frameListeners.delete(callback);
  }
```

6. En `processFrame`, sustituir desde `this.sequence.add(hands);` hasta el `return` previo a la clasificación por:

```ts
      const values = this.sequence.add(hands);
      const detected = hands.length > 0;
      this.frameListeners.forEach((callback) => callback({ values, handsDetected: detected }));
      if (detected !== this.handsDetected) {
        this.handsDetected = detected;
        this.publishStatus({
          phase: 'ready',
          handsDetected: detected,
          modelAvailable: !!this.classifier,
        });
      }

      this.framesSinceInference += 1;
      if (
        !this.classifier ||
        !this.sequence.isReady ||
        this.inferencePending ||
        this.framesSinceInference < INFERENCE_STRIDE
      ) {
        return;
      }
      this.framesSinceInference = 0;
      this.inferencePending = true;
```

(el resto de la clasificación, desde `const generation = this.generation;`, se mantiene, usando `this.classifier`).

7. Borrar el simulador, que ya no usa ninguna pantalla: `git rm desktop/src/renderer/src/services/recognition/MockSignRecognizer.ts`.

- [ ] **Step 5: Ejecutar los tests del reconocedor**

Run: `npx vitest run src/renderer/src/services/recognition`
Expected: todo en verde (incluido el test previo "solo clasifica tras reunir 30 frames", que sigue llamando una vez).

- [ ] **Step 6: Comprobar que el WASM sin SIMD ya no se empaqueta**

Run: `npx electron-vite build && ls out/renderer/assets | grep -c nosimd`
Expected: `0`.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/src/services/recognition
git commit -m "feat(desktop): reconocedor con clasificador intercambiable, frames y sin WASM no-SIMD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `GruModel` en TypeScript con paridad frente a PyTorch

**Files:**
- Create: `desktop/src/renderer/src/services/recognition/GruModel.ts`
- Test: `desktop/src/renderer/src/services/recognition/GruModel.test.ts`

**Interfaces:**
- Consumes: fixture `__fixtures__/gru-parity.json` (Task 2); `LandmarkModel`, `ModelPrediction` de `SignClassifier.ts`; `VALUES_PER_FRAME`, `SEQUENCE_LENGTH` de `landmarks.ts`.
- Produces: `class GruModel implements LandmarkModel` con `static fromJson(json: unknown): GruModel`, `readonly labels: readonly string[]`, `probabilities(sequence: readonly number[]): number[]`, `predict(sequence): ModelPrediction | null`; `class InvalidModelError extends Error`; `type GruWeightsJson`.

- [ ] **Step 1: Tests**

Crear `GruModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import fixture from './__fixtures__/gru-parity.json';
import { GruModel, InvalidModelError, type GruWeightsJson } from './GruModel';

const weights = fixture.weights as GruWeightsJson;

function clone(): GruWeightsJson {
  return JSON.parse(JSON.stringify(weights)) as GruWeightsJson;
}

describe('GruModel', () => {
  it('calcula las mismas probabilidades que PyTorch', () => {
    const model = GruModel.fromJson(weights);
    const probs = model.probabilities(fixture.input);
    expect(probs).toHaveLength(fixture.probabilities.length);
    probs.forEach((p, i) => expect(p).toBeCloseTo(fixture.probabilities[i], 4));
  });

  it('predice la etiqueta más probable con su confianza', () => {
    const model = GruModel.fromJson(weights);
    const best = fixture.probabilities.indexOf(Math.max(...fixture.probabilities));
    const prediction = model.predict(fixture.input);
    expect(prediction?.label).toBe(weights.labels[best]);
    expect(prediction?.confidence).toBeCloseTo(fixture.probabilities[best], 4);
  });

  it('devuelve null con una secuencia de longitud incorrecta', () => {
    expect(GruModel.fromJson(weights).predict([1, 2, 3])).toBeNull();
  });

  it('rechaza un formato desconocido', () => {
    expect(() => GruModel.fromJson({ ...clone(), format: 'otro' })).toThrow(InvalidModelError);
  });

  it('rechaza una capa de salida que no coincide con las etiquetas', () => {
    const w = clone();
    w.labels = [...w.labels, 'extra'];
    expect(() => GruModel.fromJson(w)).toThrow(InvalidModelError);
  });

  it('rechaza dimensiones de la GRU incorrectas', () => {
    const w = clone();
    w.gru.weight_hh = w.gru.weight_hh.slice(1);
    expect(() => GruModel.fromJson(w)).toThrow(InvalidModelError);
  });

  it('rechaza valores no finitos', () => {
    const w = clone();
    w.head.bias[0] = Number.NaN;
    expect(() => GruModel.fromJson(w)).toThrow(InvalidModelError);
  });

  it('rechaza un tamaño de entrada distinto de 126', () => {
    expect(() => GruModel.fromJson({ ...clone(), input_size: 63 })).toThrow(InvalidModelError);
  });
});
```

Si TypeScript no admite importar JSON, añadir `"resolveJsonModule": true` en `compilerOptions` de `desktop/tsconfig.web.json`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/services/recognition/GruModel.test.ts`
Expected: FAIL (`Failed to resolve import "./GruModel"`).

- [ ] **Step 3: Implementación**

Crear `GruModel.ts`:

```ts
import { SEQUENCE_LENGTH, VALUES_PER_FRAME } from './landmarks';
import type { LandmarkModel, ModelPrediction } from './SignClassifier';

export const GRU_FORMAT = 'senavoz-gru-v1';

/** Pesos tal como los exporta el servidor (convención de PyTorch, puertas r, z, n). */
export type GruWeightsJson = {
  format: string;
  input_size: number;
  hidden_size: number;
  labels: string[];
  gru: { weight_ih: number[][]; weight_hh: number[][]; bias_ih: number[]; bias_hh: number[] };
  head: { weight: number[][]; bias: number[] };
};

export class InvalidModelError extends Error {}

type Matrix = { data: Float64Array; rows: number; cols: number };

function fail(message: string): never {
  throw new InvalidModelError(message);
}

function vector(value: unknown, length: number, name: string): Float64Array {
  if (!Array.isArray(value) || value.length !== length) fail(`${name}: tamaño incorrecto`);
  const out = Float64Array.from(value as number[]);
  if (!out.every(Number.isFinite)) fail(`${name}: valores no finitos`);
  return out;
}

function matrix(value: unknown, rows: number, cols: number, name: string): Matrix {
  if (!Array.isArray(value) || value.length !== rows) fail(`${name}: filas incorrectas`);
  const data = new Float64Array(rows * cols);
  (value as unknown[]).forEach((row, r) => data.set(vector(row, cols, name), r * cols));
  return { data, rows, cols };
}

/** out = W·x + b, con x leído desde `offset`. */
function affine(w: Matrix, x: ArrayLike<number>, offset: number, b: Float64Array, out: Float64Array) {
  for (let r = 0; r < w.rows; r += 1) {
    let sum = b[r];
    const base = r * w.cols;
    for (let c = 0; c < w.cols; c += 1) sum += w.data[base + c] * x[offset + c];
    out[r] = sum;
  }
}

const sigmoid = (v: number): number => 1 / (1 + Math.exp(-v));

/** GRU de una capa + capa lineal + softmax, en TypeScript puro (sin runtimes de ML). */
export class GruModel implements LandmarkModel {
  private constructor(
    readonly labels: readonly string[],
    private readonly hidden: number,
    private readonly wih: Matrix,
    private readonly whh: Matrix,
    private readonly bih: Float64Array,
    private readonly bhh: Float64Array,
    private readonly headW: Matrix,
    private readonly headB: Float64Array,
  ) {}

  static fromJson(json: unknown): GruModel {
    const w = json as Partial<GruWeightsJson> | null;
    if (!w || w.format !== GRU_FORMAT) fail('Formato de modelo desconocido');
    if (w.input_size !== VALUES_PER_FRAME) fail('Tamaño de entrada distinto de 126');
    const h = w.hidden_size;
    if (!Number.isInteger(h) || (h as number) <= 0) fail('hidden_size no válido');
    const labels = w.labels;
    if (
      !Array.isArray(labels) ||
      labels.length < 2 ||
      !labels.every((l) => typeof l === 'string') ||
      new Set(labels).size !== labels.length
    ) {
      fail('Etiquetas no válidas');
    }
    const H = h as number;
    if (!w.gru || !w.head) fail('Faltan capas');
    return new GruModel(
      labels,
      H,
      matrix(w.gru.weight_ih, 3 * H, VALUES_PER_FRAME, 'weight_ih'),
      matrix(w.gru.weight_hh, 3 * H, H, 'weight_hh'),
      vector(w.gru.bias_ih, 3 * H, 'bias_ih'),
      vector(w.gru.bias_hh, 3 * H, 'bias_hh'),
      matrix(w.head.weight, labels.length, H, 'head.weight'),
      vector(w.head.bias, labels.length, 'head.bias'),
    );
  }

  /** Probabilidades por etiqueta para una secuencia de 30 × 126 valores. */
  probabilities(sequence: readonly number[]): number[] {
    const H = this.hidden;
    let h = new Float64Array(H);
    const gi = new Float64Array(3 * H);
    const gh = new Float64Array(3 * H);
    for (let t = 0; t < SEQUENCE_LENGTH; t += 1) {
      affine(this.wih, sequence, t * VALUES_PER_FRAME, this.bih, gi);
      affine(this.whh, h, 0, this.bhh, gh);
      const next = new Float64Array(H);
      for (let j = 0; j < H; j += 1) {
        const r = sigmoid(gi[j] + gh[j]);
        const z = sigmoid(gi[H + j] + gh[H + j]);
        const n = Math.tanh(gi[2 * H + j] + r * gh[2 * H + j]);
        next[j] = (1 - z) * n + z * h[j];
      }
      h = next;
    }
    const logits = new Float64Array(this.labels.length);
    affine(this.headW, h, 0, this.headB, logits);
    const max = Math.max(...logits);
    const exps = Array.from(logits, (v) => Math.exp(v - max));
    const total = exps.reduce((a, b) => a + b, 0);
    return exps.map((v) => v / total);
  }

  predict(sequence: readonly number[]): ModelPrediction | null {
    if (sequence.length !== SEQUENCE_LENGTH * VALUES_PER_FRAME) return null;
    const probs = this.probabilities(sequence);
    let best = 0;
    for (let i = 1; i < probs.length; i += 1) if (probs[i] > probs[best]) best = i;
    return { label: this.labels[best], confidence: probs[best] };
  }
}
```

- [ ] **Step 4: Ejecutar**

Run: `npx vitest run src/renderer/src/services/recognition/GruModel.test.ts && npm run typecheck`
Expected: 8 passed; typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/src/services/recognition/GruModel.ts desktop/src/renderer/src/services/recognition/GruModel.test.ts desktop/tsconfig.web.json
git commit -m "feat(desktop): GRU en TypeScript puro verificada contra PyTorch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API de muestras/modelos y store del modelo en memoria

**Files:**
- Modify: `desktop/src/renderer/src/api/types.ts`, `desktop/src/renderer/src/api/endpoints.ts`
- Create: `desktop/src/renderer/src/store/signModel.ts`
- Modify: `desktop/src/renderer/src/routes/AppLayout.tsx`
- Test: `desktop/src/renderer/src/__tests__/signModel.test.ts`

**Interfaces:**
- Consumes: `GruModel.fromJson` (Task 5); `createSignClassifier` (existente); `useSession` (existente).
- Produces: tipos `SampleSummary`, `ModelMetrics`, `ReadyModel`, `ModelJob`, `ModelStatus`; `samplesApi.{create(label, frames), summary(), remove(label?)}`; `modelsApi.{train(), status(), weights()}`; store `useSignModel` con estado `{ status: 'unknown' | 'none' | 'ready' | 'error'; classifier: SignClassifier | null; modelId: string | null; labels: string[]; metrics: ModelMetrics | null; job: ModelJob | null }` y acciones `refresh(): Promise<void>`, `clear(): void`; función `isTraining(job: ModelJob | null): boolean`; constante `MODEL_POLL_MS = 3000`; `SAMPLES_KEY = ['samples-summary']`.

- [ ] **Step 1: Tipos y endpoints**

Añadir a `api/types.ts`:

```ts
export type SampleSummary = { counts: Record<string, number> };

export type ModelMetrics = {
  val_accuracy: number;
  per_label: Record<string, number>;
  samples: Record<string, number>;
};

export type ReadyModel = {
  id: string;
  labels: string[];
  metrics: ModelMetrics;
  created_at: string;
};

export type ModelJob = {
  id: string;
  status: 'queued' | 'training' | 'failed';
  error: string | null;
  created_at: string;
};

export type ModelStatus = { ready: ReadyModel | null; latest: ModelJob | null };
```

Añadir a `api/endpoints.ts` (e importar los tipos nuevos):

```ts
export const SAMPLES_KEY = ['samples-summary'] as const;

export const samplesApi = {
  create: (label: string, frames: number[]) =>
    http.post<{ id: string }>('/samples', { label, frames }).then((r) => r.data),
  summary: () => http.get<SampleSummary>('/samples/summary').then((r) => r.data),
  /** Sin etiqueta borra todas las muestras y los modelos del usuario. */
  remove: (label?: string) =>
    http.delete('/samples', { params: label ? { label } : undefined }).then(() => undefined),
};

export const modelsApi = {
  train: () => http.post<{ id: string; status: string }>('/models/train').then((r) => r.data),
  status: () => http.get<ModelStatus>('/models/status').then((r) => r.data),
  // Los pesos solo viven en memoria: se piden sin caché (el servidor responde no-store).
  weights: () =>
    http
      .get<unknown>('/models/ready/weights', { headers: { 'Cache-Control': 'no-store' } })
      .then((r) => r.data),
};
```

- [ ] **Step 2: Tests del store**

Crear `__tests__/signModel.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modelsApi } from '@/api/endpoints';
import type { ModelStatus } from '@/api/types';
import { MODEL_POLL_MS, useSignModel } from '@/store/signModel';
import { useSession } from '@/store/session';

vi.mock('@/api/endpoints', () => ({
  modelsApi: { status: vi.fn(), weights: vi.fn(), train: vi.fn() },
}));

/** Pesos válidos mínimos: hidden 1, todo ceros salvo el sesgo de salida. */
function weights(labels: string[], bias: number[]) {
  const row = (n: number) => Array<number>(n).fill(0);
  return {
    format: 'senavoz-gru-v1',
    input_size: 126,
    hidden_size: 1,
    labels,
    gru: {
      weight_ih: [row(126), row(126), row(126)],
      weight_hh: [[0], [0], [0]],
      bias_ih: row(3),
      bias_hh: row(3),
    },
    head: { weight: labels.map(() => [0]), bias },
  };
}

const ready = (id: string): ModelStatus['ready'] => ({
  id,
  labels: ['neutral', 'yes'],
  metrics: { val_accuracy: 0.9, per_label: {}, samples: {} },
  created_at: '2026-10-07T00:00:00Z',
});
const SEQ = Array<number>(3780).fill(0);

beforeEach(() => {
  vi.mocked(modelsApi.status).mockReset();
  vi.mocked(modelsApi.weights).mockReset();
  useSignModel.getState().clear();
});
afterEach(() => vi.useRealTimers());

describe('store del modelo', () => {
  it('sin modelo → status none y sin clasificador', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: null, latest: null });
    await useSignModel.getState().refresh();
    expect(useSignModel.getState()).toMatchObject({ status: 'none', classifier: null });
  });

  it('carga los pesos una sola vez por id de modelo', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    await useSignModel.getState().refresh();
    expect(modelsApi.weights).toHaveBeenCalledTimes(1);
    expect(useSignModel.getState()).toMatchObject({ status: 'ready', modelId: 'm1' });
    const sign = await useSignModel.getState().classifier!.classify(SEQ);
    expect(sign).toEqual({ code: 'yes', confidence: expect.any(Number) });
  });

  it('una predicción de reposo nunca produce frase', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [9, 0]));
    await useSignModel.getState().refresh();
    expect(await useSignModel.getState().classifier!.classify(SEQ)).toBeNull();
  });

  it('pesos inválidos → status error', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue({ format: 'otro' });
    await useSignModel.getState().refresh();
    expect(useSignModel.getState()).toMatchObject({ status: 'error', classifier: null });
  });

  it('si el reentrenamiento falla, sigue usando el modelo anterior', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({
      ready: ready('m1'),
      latest: { id: 'm2', status: 'failed', error: 'Entrenamiento interrumpido', created_at: '' },
    });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    expect(useSignModel.getState().status).toBe('ready');
    expect(useSignModel.getState().job?.error).toBe('Entrenamiento interrumpido');
  });

  it('sondea mientras entrena y se detiene al cerrar sesión', async () => {
    vi.useFakeTimers();
    vi.mocked(modelsApi.status).mockResolvedValue({
      ready: null,
      latest: { id: 'm1', status: 'training', error: null, created_at: '' },
    });
    await useSignModel.getState().refresh();
    expect(modelsApi.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MODEL_POLL_MS);
    expect(modelsApi.status).toHaveBeenCalledTimes(2);

    useSession.setState({ status: 'authenticated' });
    useSession.setState({ status: 'unauthenticated' });
    await vi.advanceTimersByTimeAsync(MODEL_POLL_MS * 3);
    expect(modelsApi.status).toHaveBeenCalledTimes(2);
    expect(useSignModel.getState()).toMatchObject({ status: 'unknown', job: null });
  });

  it('cerrar sesión descarta el modelo de la memoria', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    useSession.setState({ status: 'authenticated' });
    await useSignModel.getState().refresh();
    useSession.setState({ status: 'unauthenticated' });
    expect(useSignModel.getState()).toMatchObject({ classifier: null, modelId: null });
  });

  it('un fallo de red conserva el estado actual', async () => {
    vi.mocked(modelsApi.status).mockResolvedValueOnce({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    vi.mocked(modelsApi.status).mockRejectedValueOnce(new Error('offline'));
    await useSignModel.getState().refresh();
    expect(useSignModel.getState().status).toBe('ready');
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/signModel.test.ts`
Expected: FAIL (`Failed to resolve import "@/store/signModel"`).

- [ ] **Step 4: Implementar el store**

Crear `store/signModel.ts`:

```ts
import { create } from 'zustand';

import { modelsApi } from '@/api/endpoints';
import type { ModelJob, ModelMetrics } from '@/api/types';
import { GruModel } from '@/services/recognition/GruModel';
import { createSignClassifier, type SignClassifier } from '@/services/recognition/SignClassifier';
import { useSession } from '@/store/session';

export const MODEL_POLL_MS = 3000;
const NEUTRAL = 'neutral';

type ModelStatus = 'unknown' | 'none' | 'ready' | 'error';

type SignModelState = {
  status: ModelStatus;
  classifier: SignClassifier | null;
  modelId: string | null;
  labels: string[];
  metrics: ModelMetrics | null;
  /** Último entrenamiento posterior al modelo listo (en cola, entrenando o fallido). */
  job: ModelJob | null;
  refresh: () => Promise<void>;
  clear: () => void;
};

export const isTraining = (job: ModelJob | null): boolean =>
  job?.status === 'queued' || job?.status === 'training';

const initial = {
  status: 'unknown' as ModelStatus,
  classifier: null,
  modelId: null,
  labels: [],
  metrics: null,
  job: null,
};

// Generación: una respuesta que llega tras clear() (cierre de sesión) se descarta.
let generation = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** Modelo de señas del usuario, solo en memoria: nunca se escribe en disco. */
export const useSignModel = create<SignModelState>()((set, get) => ({
  ...initial,

  async refresh() {
    const gen = generation;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    let job: ModelJob | null = get().job;
    try {
      const { ready, latest } = await modelsApi.status();
      if (gen !== generation) return;
      job = latest;
      set({ job });
      if (!ready) {
        set({ status: 'none', classifier: null, modelId: null, labels: [], metrics: null });
      } else if (ready.id !== get().modelId) {
        try {
          const model = GruModel.fromJson(await modelsApi.weights());
          if (gen !== generation) return;
          // `neutral` no está en el mapa: nunca se convierte en frase.
          const labelToCode = Object.fromEntries(
            model.labels.filter((l) => l !== NEUTRAL).map((l) => [l, l]),
          );
          set({
            status: 'ready',
            classifier: createSignClassifier(model, labelToCode),
            modelId: ready.id,
            labels: [...model.labels],
            metrics: ready.metrics,
          });
        } catch {
          if (gen !== generation) return;
          set({ status: 'error', classifier: null, modelId: null, labels: [], metrics: null });
        }
      }
    } catch {
      // Sin red: se conserva el estado actual y se reintenta en el siguiente sondeo.
    }
    if (gen === generation && isTraining(job)) {
      pollTimer = setTimeout(() => void get().refresh(), MODEL_POLL_MS);
    }
  },

  clear() {
    generation += 1;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    set(initial);
  },
}));

// Al cerrar sesión (o si caduca), el modelo se descarta de la memoria.
useSession.subscribe((state, prev) => {
  if (prev.status === 'authenticated' && state.status !== 'authenticated') {
    useSignModel.getState().clear();
  }
});
```

- [ ] **Step 5: Cargar el modelo al entrar**

En `routes/AppLayout.tsx`, importar `useEffect` de `react` y `useSignModel` de `@/store/signModel`, y dentro de `AppLayout`, tras `useVoicePreload();`:

```ts
  // Con la sesión iniciada se consulta el modelo (solo descarga pesos si cambió).
  useEffect(() => {
    void useSignModel.getState().refresh();
  }, []);
```

- [ ] **Step 6: Ejecutar**

Run: `npx vitest run && npm run typecheck`
Expected: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/src/api desktop/src/renderer/src/store/signModel.ts desktop/src/renderer/src/__tests__/signModel.test.ts desktop/src/renderer/src/routes/AppLayout.tsx
git commit -m "feat(desktop): API de muestras y modelos, y modelo de señas en memoria

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Reconocimiento con el modelo del usuario en Cámara y Modo reunión

**Files:**
- Modify: `desktop/src/renderer/src/hooks/useSignRecognition.ts`
- Modify: `desktop/src/renderer/src/routes/Camera.tsx`, `desktop/src/renderer/src/routes/Meeting.tsx`
- Modify: `desktop/src/renderer/src/i18n/es.ts`
- Test: `desktop/src/renderer/src/__tests__/cameraScreen.test.tsx`

**Interfaces:**
- Consumes: `useSignModel`, `isTraining` (Task 6); `setClassifier`, `onFrame`, `LandmarkFrame` (Task 4).
- Produces: `useSignRecognition(videoRef, onSign, options?: { classify?: boolean; onFrame?: (frame: LandmarkFrame) => void })`; `modelStatusText(state: Pick<SignModelState, 'status' | 'metrics' | 'job'>): string` exportada desde `hooks/useSignRecognition.ts`.

- [ ] **Step 1: Textos**

En `i18n/es.ts`, sustituir estas claves de `camera.*`:

```ts
  'camera.modelUnavailable': 'Detector activo. Graba tus señas en Entrenar para reconocerlas.',
  'camera.handsWithoutModel': 'Manos detectadas. Graba tus señas en Entrenar para reconocerlas.',
  'camera.modelNo': 'Sin modelo',
  'camera.noModelTitle': 'Aún no tienes un modelo',
  'camera.noModelBody':
    'Graba tus señas en Entrenar para que SeñaVoz las reconozca. Mientras tanto usa las frases rápidas o sus atajos 1–9.',
  'camera.toPhrases': 'Ir a Entrenar',
```

y añadir:

```ts
  'camera.modelTraining': 'Entrenando…',
  'camera.modelReady': 'Listo · precisión {pct} %',
  'camera.modelError': 'Error al cargar el modelo',
```

(eliminar `'camera.modelYes'`, que deja de usarse).

- [ ] **Step 2: Actualizar los tests de Cámara**

En `__tests__/cameraScreen.test.tsx`:

1. Añadir a la clase falsa del reconocedor:

```ts
    setClassifier(): void {}
    onFrame(): () => void {
      return vi.fn();
    }
```

2. Sustituir `'Detector activo. Falta un modelo entrenado'` por `'Detector activo. Graba tus señas'` en los `findByText` (regex `/Detector activo/` sigue valiendo).

3. Sustituir el test del panel por:

```ts
  it('panel de estado: sin modelo, con enlace a Entrenar', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Aún no tienes un modelo')).toBeInTheDocument();
    expect(screen.getByText('Sin modelo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Entrenar' })).toHaveAttribute(
      'href',
      '#/entrenar',
    );
  });

  it('con un modelo listo muestra su precisión y oculta el aviso', async () => {
    useSignModel.setState({
      status: 'ready',
      metrics: { val_accuracy: 0.92, per_label: {}, samples: {} },
      job: null,
    });
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Listo · precisión 92 %')).toBeInTheDocument();
    expect(screen.queryByText('Aún no tienes un modelo')).not.toBeInTheDocument();
  });

  it('mientras entrena lo indica', async () => {
    useSignModel.setState({
      status: 'none',
      job: { id: 'm1', status: 'training', error: null, created_at: '' },
    });
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Entrenando…')).toBeInTheDocument();
  });
```

4. Importar `useSignModel` de `@/store/signModel` y, en `beforeEach`, añadir `useSignModel.getState().clear(); useSignModel.setState({ status: 'none' });`.

- [ ] **Step 3: Ejecutar y ver que fallan**

Run: `npx vitest run src/renderer/src/__tests__/cameraScreen.test.tsx`
Expected: FAIL (no encuentra "Aún no tienes un modelo").

- [ ] **Step 4: Hook**

En `hooks/useSignRecognition.ts`:

1. Imports: añadir `import type { LandmarkFrame } from '@/services/recognition/SignRecognizer';` (junto a `RecognitionStatus`), `import { isTraining, useSignModel } from '@/store/signModel';` y `import { t } from '@/i18n';` (además del `TranslationKey` existente).

2. Añadir antes del hook:

```ts
type ModelView = {
  status: 'unknown' | 'none' | 'ready' | 'error';
  metrics: { val_accuracy: number } | null;
  job: Parameters<typeof isTraining>[0];
};

/** Texto del estado del modelo de señas para los paneles de Cámara y Reunión. */
export function modelStatusText(model: ModelView): string {
  if (isTraining(model.job)) return t('camera.modelTraining');
  if (model.status === 'ready' && model.metrics) {
    return t('camera.modelReady', { pct: String(Math.round(model.metrics.val_accuracy * 100)) });
  }
  if (model.status === 'error') return t('camera.modelError');
  return t('camera.modelNo');
}

export type SignRecognitionOptions = {
  /** false en la pantalla Entrenar: solo se necesitan los frames. */
  classify?: boolean;
  onFrame?: (frame: LandmarkFrame) => void;
};
```

3. Firma: `export function useSignRecognition(videoRef, onSign, options: SignRecognitionOptions = {})`.

4. Tras el efecto de `onSignRef`, añadir:

```ts
  const classify = options.classify ?? true;
  const modelClassifier = useSignModel((s) => s.classifier);
  const classifier = classify ? modelClassifier : null;
  const classifierRef = useRef(classifier);
  const onFrameRef = useRef(options.onFrame);
  useEffect(() => {
    onFrameRef.current = options.onFrame;
  });
  const recognizerRef = useRef<MediaPipeSignRecognizer | null>(null);

  // Un modelo nuevo (p. ej. tras entrenar) se aplica sin reiniciar la cámara.
  useEffect(() => {
    classifierRef.current = classifier;
    recognizerRef.current?.setClassifier(classifier);
  }, [classifier]);
```

5. En el efecto de la cámara, sustituir el bloque `recognizer = new MediaPipeSignRecognizer(videoElement); …` por:

```ts
            recognizer = new MediaPipeSignRecognizer(videoElement, {
              classifier: classifierRef.current,
            });
            recognizerRef.current = recognizer;
            unsubscribeSign = recognizer.onSign(({ code }) => onSignRef.current(code));
            unsubscribeStatus = recognizer.onStatus((status) => setRecognition(status));
            unsubscribeFrame = recognizer.onFrame((frame) => onFrameRef.current?.(frame));
            void recognizer.start();
```

declarando `let unsubscribeFrame: (() => void) | null = null;` junto a los otros, y en la limpieza: `unsubscribeFrame?.();` y `recognizerRef.current = null;` antes de `recognizer?.stop();`.

- [ ] **Step 5: Pantalla Cámara**

En `routes/Camera.tsx`:

1. Imports: `useSignRecognition, visionMessageKey, modelStatusText` desde el hook; `import { isTraining, useSignModel } from '@/store/signModel';`.
2. Tras `const hands = …`:

```ts
  const model = useSignModel((s) => ({ status: s.status, metrics: s.metrics, job: s.job }));
  const modelReady = model.status === 'ready';
  const training = isTraining(model.job);
```

Como el selector devuelve un objeto nuevo en cada render, usar `useShallow`: `import { useShallow } from 'zustand/react/shallow';` y `useSignModel(useShallow((s) => ({ … })))`.

3. Sustituir `const modelAvailable = recognition?.modelAvailable ?? false;` por nada (se deja de usar) y la fila del modelo por:

```tsx
            <p className={styles.statusRow}>
              {t('camera.statusModel')}
              <Status ok={modelReady} label={modelStatusText(model)} />
            </p>
```

4. El aviso pasa a depender del modelo:

```tsx
          {ready && !modelReady && !training ? (
            <section className={styles.warnPanel}>
              <h2>{t('camera.noModelTitle')}</h2>
              <p>{t('camera.noModelBody')}</p>
              <Link to="/entrenar" className={styles.linkButton}>
                {t('camera.toPhrases')}
              </Link>
            </section>
          ) : null}
```

- [ ] **Step 6: Modo reunión**

En `routes/Meeting.tsx`, bajo el vídeo, mostrar también el estado del modelo:

```tsx
      <div className={styles.cam}>
        <video ref={videoRef} className={styles.thumb} autoPlay muted playsInline />
        <div>
          <p className={styles.small}>{t(visionMessageKey(recognition))}</p>
          <p className={styles.small}>{modelStatusText(model)}</p>
        </div>
      </div>
```

con `const model = useSignModel(useShallow((s) => ({ status: s.status, metrics: s.metrics, job: s.job })));` y los imports correspondientes. En `__tests__/meetingScreen.test.tsx`, añadir `modelStatusText: () => 'Sin modelo'` al mock de `@/hooks/useSignRecognition`.

- [ ] **Step 7: Ejecutar**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/renderer/src
git commit -m "feat(desktop): Cámara y Modo reunión usan el modelo del usuario y muestran su estado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Lógica de grabación por ráfagas

**Files:**
- Create: `desktop/src/renderer/src/services/training/burstRecorder.ts`
- Test: `desktop/src/renderer/src/services/training/burstRecorder.test.ts`

**Interfaces:**
- Consumes: `LandmarkFrame` (Task 4); `SEQUENCE_LENGTH` (existente).
- Produces: `class BurstRecorder` con `constructor(onEvent: (e: BurstEvent) => void, options: BurstOptions)`, `start()`, `addFrame(frame: LandmarkFrame)`, `stop()`, getter `running: boolean`; `type BurstEvent = { type: 'countdown'; secondsLeft: number } | { type: 'recording'; burst: number } | { type: 'sample'; frames: number[] } | { type: 'rejected' } | { type: 'done' }`; `type BurstOptions = { requireHands: boolean; bursts?: number; countdownSeconds?: number; pauseMs?: number }`; constantes `BURSTS_PER_SESSION = 5`, `MIN_HAND_FRAMES = 15`.

- [ ] **Step 1: Tests**

Crear `burstRecorder.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BurstRecorder, type BurstEvent } from './burstRecorder';

const frame = (handsDetected: boolean, v = 0.1) => ({
  values: Array<number>(126).fill(v),
  handsDetected,
});

function feed(rec: BurstRecorder, n: number, hands = true) {
  for (let i = 0; i < n; i += 1) rec.addFrame(frame(hands));
}

let events: BurstEvent[];
beforeEach(() => {
  vi.useFakeTimers();
  events = [];
});
afterEach(() => vi.useRealTimers());

describe('BurstRecorder', () => {
  it('cuenta atrás 3-2-1 y luego graba; ignora frames durante la cuenta', () => {
    const rec = new BurstRecorder((e) => events.push(e), { requireHands: true });
    rec.start();
    feed(rec, 40);
    expect(events).toEqual([{ type: 'countdown', secondsLeft: 3 }]);
    vi.advanceTimersByTime(3000);
    expect(events.slice(1)).toEqual([
      { type: 'countdown', secondsLeft: 2 },
      { type: 'countdown', secondsLeft: 1 },
      { type: 'recording', burst: 1 },
    ]);
  });

  it('emite una muestra de 3.780 valores al reunir 30 frames', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: true,
      countdownSeconds: 0,
    });
    rec.start();
    feed(rec, 30);
    const sample = events.find((e) => e.type === 'sample');
    expect(sample && sample.type === 'sample' && sample.frames).toHaveLength(3780);
  });

  it('descarta una ráfaga con manos en menos de 15 frames', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: true,
      countdownSeconds: 0,
    });
    rec.start();
    feed(rec, 16, false);
    feed(rec, 14, true);
    expect(events.some((e) => e.type === 'sample')).toBe(false);
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
  });

  it('en reposo acepta ráfagas sin manos', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: false,
      countdownSeconds: 0,
    });
    rec.start();
    feed(rec, 30, false);
    expect(events.some((e) => e.type === 'sample')).toBe(true);
  });

  it('hace 5 ráfagas con pausa de 1 s entre ellas y termina', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: true,
      countdownSeconds: 0,
    });
    rec.start();
    for (let i = 0; i < 5; i += 1) {
      feed(rec, 30);
      feed(rec, 10); // durante la pausa no cuenta
      vi.advanceTimersByTime(1000);
    }
    expect(events.filter((e) => e.type === 'sample')).toHaveLength(5);
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(rec.running).toBe(false);
  });

  it('stop() cancela la cuenta atrás y no emite más eventos', () => {
    const rec = new BurstRecorder((e) => events.push(e), { requireHands: true });
    rec.start();
    rec.stop();
    vi.advanceTimersByTime(5000);
    feed(rec, 30);
    expect(events).toEqual([{ type: 'countdown', secondsLeft: 3 }]);
    expect(rec.running).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/services/training`
Expected: FAIL (`Failed to resolve import "./burstRecorder"`).

- [ ] **Step 3: Implementación**

Crear `burstRecorder.ts`:

```ts
import { SEQUENCE_LENGTH } from '@/services/recognition/landmarks';
import type { LandmarkFrame } from '@/services/recognition/SignRecognizer';

export const BURSTS_PER_SESSION = 5;
/** Una ráfaga con manos en menos de la mitad de los frames no sirve para entrenar. */
export const MIN_HAND_FRAMES = 15;

export type BurstEvent =
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'recording'; burst: number }
  | { type: 'sample'; frames: number[] }
  | { type: 'rejected' }
  | { type: 'done' };

export type BurstOptions = {
  /** false para la clase de reposo, que se graba sin manos. */
  requireHands: boolean;
  bursts?: number;
  countdownSeconds?: number;
  pauseMs?: number;
};

type Phase = 'idle' | 'countdown' | 'recording' | 'pause';

/** Sesión de grabación: cuenta atrás, ráfagas de 30 frames y pausas entre ellas. */
export class BurstRecorder {
  private phase: Phase = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frames: number[][] = [];
  private handFrames = 0;
  private burst = 0;
  private readonly bursts: number;
  private readonly countdownSeconds: number;
  private readonly pauseMs: number;

  constructor(
    private readonly onEvent: (event: BurstEvent) => void,
    private readonly options: BurstOptions,
  ) {
    this.bursts = options.bursts ?? BURSTS_PER_SESSION;
    this.countdownSeconds = options.countdownSeconds ?? 3;
    this.pauseMs = options.pauseMs ?? 1000;
  }

  get running(): boolean {
    return this.phase !== 'idle';
  }

  start(): void {
    if (this.running) return;
    this.burst = 0;
    this.countdown(this.countdownSeconds);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.phase = 'idle';
    this.frames = [];
  }

  addFrame(frame: LandmarkFrame): void {
    if (this.phase !== 'recording') return;
    this.frames.push(frame.values);
    if (frame.handsDetected) this.handFrames += 1;
    if (this.frames.length < SEQUENCE_LENGTH) return;

    const accepted = !this.options.requireHands || this.handFrames >= MIN_HAND_FRAMES;
    const frames = this.frames.flat();
    this.frames = [];
    // El evento puede llamar a stop() (p. ej. si falla la subida): se comprueba después.
    this.onEvent(accepted ? { type: 'sample', frames } : { type: 'rejected' });
    if (this.phase !== 'recording') return;
    if (this.burst >= this.bursts) {
      this.phase = 'idle';
      this.onEvent({ type: 'done' });
      return;
    }
    this.phase = 'pause';
    this.timer = setTimeout(() => this.record(), this.pauseMs);
  }

  private countdown(secondsLeft: number): void {
    if (secondsLeft <= 0) {
      this.record();
      return;
    }
    this.phase = 'countdown';
    this.onEvent({ type: 'countdown', secondsLeft });
    this.timer = setTimeout(() => this.countdown(secondsLeft - 1), 1000);
  }

  private record(): void {
    this.timer = null;
    this.burst += 1;
    this.frames = [];
    this.handFrames = 0;
    this.phase = 'recording';
    this.onEvent({ type: 'recording', burst: this.burst });
  }
}
```

- [ ] **Step 4: Ejecutar**

Run: `npx vitest run src/renderer/src/services/training`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/src/services/training
git commit -m "feat(desktop): lógica de grabación por ráfagas con cuenta atrás y descarte sin manos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Pantalla Entrenar

**Files:**
- Create: `desktop/src/renderer/src/routes/Train.tsx`, `desktop/src/renderer/src/routes/train.module.css`
- Modify: `desktop/src/renderer/src/App.tsx`, `desktop/src/renderer/src/routes/AppLayout.tsx`, `desktop/src/renderer/src/ui/icons.tsx`, `desktop/src/renderer/src/i18n/es.ts`
- Test: `desktop/src/renderer/src/__tests__/trainScreen.test.tsx`

**Interfaces:**
- Consumes: `useSignRecognition(videoRef, onSign, { classify: false, onFrame })` (Task 7); `BurstRecorder`, `BurstEvent`, `BurstOptions` (Task 8); `samplesApi`, `modelsApi`, `SAMPLES_KEY` (Task 6); `useSignModel`, `isTraining` (Task 6); `apiErrorStatus`, `isNetworkError` (existentes).
- Produces: componente por defecto `Train({ timing }: { timing?: Pick<BurstOptions, 'countdownSeconds' | 'pauseMs'> })`; ruta `/entrenar`; `IconTrain`; constante `MIN_SAMPLES = 20` exportada desde `Train.tsx`.

- [ ] **Step 1: Textos**

Añadir a `i18n/es.ts`:

```ts
  'nav.train': 'Entrenar',

  'train.title': 'Entrenar mis señas',
  'train.subtitle':
    'Graba cada seña unas 20 veces. Solo se envían los puntos de tus manos, nunca vídeo, y no se guarda nada en este equipo.',
  'train.neutral': 'Reposo (manos quietas o bajadas)',
  'train.count': '{n} / {min} muestras',
  'train.record': 'Grabar',
  'train.stop': 'Parar',
  'train.delete': 'Borrar muestras',
  'train.confirmDelete': '¿Borrar? Pulsa otra vez',
  'train.countdown': 'Prepárate… {n}',
  'train.recording': 'Grabando {n} de {total}',
  'train.rejected': 'No se vieron tus manos; repite la seña.',
  'train.done': 'Sesión terminada.',
  'train.uploadError': 'No se pudo enviar la muestra. Revisa tu conexión y vuelve a grabar.',
  'train.labelFull': 'Ya tienes 100 muestras de esta frase.',
  'train.trainButton': 'Entrenar modelo',
  'train.trainHint': 'Necesitas 20 muestras de Reposo y de al menos 2 frases.',
  'train.training': 'Entrenando… puede tardar un par de minutos.',
  'train.inProgress': 'Ya hay un entrenamiento en curso.',
  'train.missing': 'Faltan muestras para entrenar.',
  'train.failed': 'El entrenamiento falló: {error}',
  'train.accuracy': 'Precisión del modelo: {pct} %',
  'train.labelAccuracy': 'Precisión: {pct} %',
  'train.needMore': 'graba más muestras',
```

- [ ] **Step 2: Tests de la pantalla**

Crear `__tests__/trainScreen.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { HashRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { modelsApi, samplesApi } from '@/api/endpoints';
import Train from '@/routes/Train';
import type { LandmarkFrame } from '@/services/recognition/SignRecognizer';
import { useSignModel } from '@/store/signModel';

const captured = vi.hoisted(() => ({ onFrame: null as null | ((f: LandmarkFrame) => void) }));
vi.mock('@/hooks/useSignRecognition', () => ({
  useSignRecognition: (
    _ref: unknown,
    _onSign: unknown,
    options: { onFrame?: (f: LandmarkFrame) => void },
  ) => {
    captured.onFrame = options.onFrame ?? null;
    return {
      cam: { kind: 'ready' },
      cameras: [],
      recognition: { phase: 'ready', handsDetected: true, modelAvailable: false },
      cameraId: null,
      retry: vi.fn(),
      selectCamera: vi.fn(),
    };
  },
  visionMessageKey: () => 'camera.handsDetected',
}));
vi.mock('@/api/endpoints', () => ({
  SAMPLES_KEY: ['samples-summary'],
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'yes', text_es: 'Sí', is_default: true },
      { id: '2', code: 'no', text_es: 'No', is_default: true },
    ],
  },
  samplesApi: { create: vi.fn(), summary: vi.fn(), remove: vi.fn() },
  modelsApi: { train: vi.fn(), status: vi.fn(), weights: vi.fn() },
}));

const http = (status: number) =>
  new AxiosError('x', String(status), undefined, undefined, { status } as AxiosResponse);

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HashRouter>
        <Train timing={{ countdownSeconds: 0, pauseMs: 0 }} />
      </HashRouter>
    </QueryClientProvider>,
  );
}

async function sendFrames(n: number, handsDetected = true) {
  await act(async () => {
    for (let i = 0; i < n; i += 1) {
      captured.onFrame?.({ values: Array<number>(126).fill(0.1), handsDetected });
    }
  });
}

const row = (name: string) => screen.getByRole('listitem', { name });

beforeEach(() => {
  vi.mocked(samplesApi.create).mockReset().mockResolvedValue({ id: 's' });
  vi.mocked(samplesApi.summary).mockReset().mockResolvedValue({ counts: { yes: 3 } });
  vi.mocked(samplesApi.remove).mockReset().mockResolvedValue(undefined);
  vi.mocked(modelsApi.train).mockReset().mockResolvedValue({ id: 'm', status: 'queued' });
  vi.mocked(modelsApi.status).mockReset().mockResolvedValue({ ready: null, latest: null });
  useSignModel.getState().clear();
});

describe('pantalla Entrenar', () => {
  it('lista Reposo y las frases con su contador', async () => {
    renderScreen();
    expect(await screen.findByText('3 / 20 muestras')).toBeInTheDocument();
    expect(row('Reposo (manos quietas o bajadas)')).toHaveTextContent('0 / 20 muestras');
    expect(row('Sí')).toHaveTextContent('3 / 20 muestras');
  });

  it('graba una ráfaga y la sube al momento', async () => {
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Grabar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Grabando 1 de 5');
    await sendFrames(30);
    expect(samplesApi.create).toHaveBeenCalledWith('yes', expect.any(Array));
    expect(vi.mocked(samplesApi.create).mock.calls[0][1]).toHaveLength(3780);
  });

  it('una ráfaga sin manos no se sube', async () => {
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Grabar' }));
    await sendFrames(30, false);
    expect(samplesApi.create).not.toHaveBeenCalled();
    expect(screen.getByText('No se vieron tus manos; repite la seña.')).toBeInTheDocument();
  });

  it('si falla la subida se detiene la sesión y se avisa', async () => {
    vi.mocked(samplesApi.create).mockRejectedValue(new AxiosError('Network Error'));
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Grabar' }));
    await sendFrames(30);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar la muestra');
    expect(screen.queryByRole('button', { name: 'Parar' })).not.toBeInTheDocument();
    await sendFrames(30);
    expect(samplesApi.create).toHaveBeenCalledTimes(1);
  });

  it('"Entrenar modelo" se activa con Reposo y 2 frases al mínimo', async () => {
    vi.mocked(samplesApi.summary).mockResolvedValue({ counts: { neutral: 20, yes: 20, no: 19 } });
    const { unmount } = renderScreen();
    expect(await screen.findByRole('button', { name: 'Entrenar modelo' })).toBeDisabled();
    unmount();

    vi.mocked(samplesApi.summary).mockResolvedValue({ counts: { neutral: 20, yes: 20, no: 20 } });
    renderScreen();
    const button = await screen.findByRole('button', { name: 'Entrenar modelo' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(modelsApi.train).toHaveBeenCalled();
    expect(modelsApi.status).toHaveBeenCalled();
  });

  it('muestra el error 409 del servidor', async () => {
    vi.mocked(samplesApi.summary).mockResolvedValue({ counts: { neutral: 20, yes: 20, no: 20 } });
    vi.mocked(modelsApi.train).mockRejectedValue(http(409));
    renderScreen();
    const button = await screen.findByRole('button', { name: 'Entrenar modelo' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay un entrenamiento en curso.');
  });

  it('muestra la precisión por frase y avisa si es baja', async () => {
    useSignModel.setState({
      status: 'ready',
      metrics: { val_accuracy: 0.85, per_label: { yes: 0.95, no: 0.6 }, samples: {} },
    });
    renderScreen();
    expect(await screen.findByText('Precisión del modelo: 85 %')).toBeInTheDocument();
    expect(row('Sí')).toHaveTextContent('Precisión: 95 %');
    expect(row('No')).toHaveTextContent('Precisión: 60 % · graba más muestras');
  });

  it('borrar muestras de una frase pide confirmación', async () => {
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Borrar muestras' }));
    expect(samplesApi.remove).not.toHaveBeenCalled();
    await userEvent.click(
      within(row('Sí')).getByRole('button', { name: '¿Borrar? Pulsa otra vez' }),
    );
    expect(samplesApi.remove).toHaveBeenCalledWith('yes');
  });

  it('muestra el error de un entrenamiento fallido', async () => {
    useSignModel.setState({
      job: { id: 'm', status: 'failed', error: 'Entrenamiento interrumpido', created_at: '' },
    });
    renderScreen();
    expect(
      await screen.findByText('El entrenamiento falló: Entrenamiento interrumpido'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/trainScreen.test.tsx`
Expected: FAIL (`Failed to resolve import "@/routes/Train"`).

- [ ] **Step 4: Icono, ruta y navegación**

En `ui/icons.tsx`:

```tsx
/** Entrenar: una mano abierta. */
export const IconTrain = (p: Props) => (
  <Svg {...p}>
    <path d="M7 11V6a1.5 1.5 0 013 0v5M10 10V4.5a1.5 1.5 0 013 0V10M13 10V5.5a1.5 1.5 0 013 0V12" />
    <path d="M16 12V9a1.5 1.5 0 013 0v5a7 7 0 01-7 7h-1a6 6 0 01-5-2.7L3.6 14.6a1.5 1.5 0 012.4-1.8L7 14" />
  </Svg>
);
```

En `routes/AppLayout.tsx`, importar `IconTrain` y añadir a `links`, tras la cámara:

```ts
  { to: '/entrenar', label: 'nav.train', Icon: IconTrain },
```

En `App.tsx`: `import Train from '@/routes/Train';` y `<Route path="/entrenar" element={<Train />} />` tras la ruta de cámara.

- [ ] **Step 5: Estilos**

Crear `routes/train.module.css`:

```css
.layout {
  display: grid;
  grid-template-columns: minmax(280px, 420px) 1fr;
  gap: 24px;
  align-items: start;
}
@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.stage {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: #000;
  aspect-ratio: 4 / 3;
}
.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
}
.overlay {
  position: absolute;
  inset: auto 12px 12px 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(15, 17, 20, 0.85);
  font-weight: 700;
  font-size: 18px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.itemActive {
  border-color: var(--accent);
}
.itemText {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.itemName {
  font-weight: 700;
}
.count {
  color: var(--text-muted);
  font-size: 14px;
}
.countDone {
  color: var(--live-text);
}
.low {
  color: var(--accent);
}
.actions {
  display: flex;
  gap: 8px;
}
.footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}
.error {
  margin: 0;
  color: var(--danger);
}
```

- [ ] **Step 6: Pantalla**

Crear `routes/Train.tsx`:

```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { apiErrorStatus } from '@/api/client';
import { modelsApi, SAMPLES_KEY, samplesApi } from '@/api/endpoints';
import { usePhrases } from '@/api/usePhrases';
import { useSignRecognition } from '@/hooks/useSignRecognition';
import { t } from '@/i18n';
import {
  BURSTS_PER_SESSION,
  BurstRecorder,
  type BurstEvent,
  type BurstOptions,
} from '@/services/training/burstRecorder';
import { isTraining, useSignModel } from '@/store/signModel';
import { Button } from '@/ui/Button';

import styles from './routes.module.css';
import train from './train.module.css';

export const MIN_SAMPLES = 20;
const NEUTRAL = 'neutral';
const LOW_ACCURACY = 0.8;

type Timing = Pick<BurstOptions, 'countdownSeconds' | 'pauseMs'>;
type Session = { label: string; message: string };

const pct = (v: number) => String(Math.round(v * 100));

export default function Train({ timing }: { timing?: Timing }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const queryClient = useQueryClient();
  const { data: phrases } = usePhrases();
  const { data: summary } = useQuery({ queryKey: SAMPLES_KEY, queryFn: samplesApi.summary });
  const model = useSignModel(
    useShallow((s) => ({ status: s.status, metrics: s.metrics, job: s.job })),
  );
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<BurstRecorder | null>(null);

  useSignRecognition(videoRef, () => {}, {
    classify: false,
    onFrame: (frame) => recorderRef.current?.addFrame(frame),
  });

  // Al salir de la pantalla se cancela la sesión en curso.
  useEffect(() => () => recorderRef.current?.stop(), []);

  const counts = summary?.counts ?? {};
  const rows = [
    { label: NEUTRAL, text: t('train.neutral') },
    ...(phrases ?? []).map((p) => ({ label: p.code, text: p.text_es })),
  ];
  const readyPhrases = rows.filter(
    (r) => r.label !== NEUTRAL && (counts[r.label] ?? 0) >= MIN_SAMPLES,
  ).length;
  const training = isTraining(model.job);
  const canTrain =
    (counts[NEUTRAL] ?? 0) >= MIN_SAMPLES && readyPhrases >= 2 && !training && !session;

  const stopSession = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setSession(null);
  };

  const onEvent = (label: string) => (event: BurstEvent) => {
    switch (event.type) {
      case 'countdown':
        setSession({ label, message: t('train.countdown', { n: String(event.secondsLeft) }) });
        break;
      case 'recording':
        setSession({
          label,
          message: t('train.recording', {
            n: String(event.burst),
            total: String(BURSTS_PER_SESSION),
          }),
        });
        break;
      case 'rejected':
        setNotice(t('train.rejected'));
        break;
      case 'sample':
        setNotice(null);
        // Se envía al momento; si falla, la muestra se pierde (no hay cola local).
        samplesApi.create(label, event.frames).then(
          () => void queryClient.invalidateQueries({ queryKey: SAMPLES_KEY }),
          (e: unknown) => {
            stopSession();
            setError(t(apiErrorStatus(e) === 409 ? 'train.labelFull' : 'train.uploadError'));
          },
        );
        break;
      case 'done':
        recorderRef.current = null;
        setSession(null);
        setNotice(t('train.done'));
        break;
    }
  };

  const startSession = (label: string) => {
    setError(null);
    setNotice(null);
    const recorder = new BurstRecorder(onEvent(label), {
      requireHands: label !== NEUTRAL,
      ...timing,
    });
    recorderRef.current = recorder;
    setSession({ label, message: '' });
    recorder.start();
  };

  const onDelete = async (label: string) => {
    if (confirmDelete !== label) {
      setConfirmDelete(label);
      return;
    }
    setConfirmDelete(null);
    try {
      await samplesApi.remove(label);
      await queryClient.invalidateQueries({ queryKey: SAMPLES_KEY });
    } catch {
      setError(t('error.generic'));
    }
  };

  const onTrain = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await modelsApi.train();
    } catch (e) {
      const status = apiErrorStatus(e);
      setError(
        t(
          status === 409 ? 'train.inProgress' : status === 422 ? 'train.missing' : 'error.generic',
        ),
      );
    } finally {
      setSubmitting(false);
      await useSignModel.getState().refresh();
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{t('train.title')}</h1>
          <p className={styles.hint}>{t('train.subtitle')}</p>
        </div>
      </header>

      <div className={train.layout}>
        <div className={train.stage}>
          <video ref={videoRef} className={train.video} autoPlay muted playsInline />
          {session?.message ? (
            <p role="status" className={train.overlay}>
              {session.message}
            </p>
          ) : null}
        </div>

        <div className={styles.aside}>
          {error ? (
            <p role="alert" className={train.error}>
              {error}
            </p>
          ) : null}
          {notice ? <p className={styles.muted}>{notice}</p> : null}

          <ul className={train.list}>
            {rows.map(({ label, text }) => {
              const n = counts[label] ?? 0;
              const acc = model.metrics?.per_label[label];
              const active = session?.label === label;
              return (
                <li
                  key={label}
                  aria-label={text}
                  className={active ? `${train.item} ${train.itemActive}` : train.item}
                >
                  <div className={train.itemText}>
                    <span className={train.itemName}>{text}</span>
                    <span className={n >= MIN_SAMPLES ? train.countDone : train.count}>
                      {t('train.count', { n: String(n), min: String(MIN_SAMPLES) })}
                    </span>
                    {acc !== undefined && label !== NEUTRAL ? (
                      <span className={acc < LOW_ACCURACY ? train.low : train.count}>
                        {t('train.labelAccuracy', { pct: pct(acc) })}
                        {acc < LOW_ACCURACY ? ` · ${t('train.needMore')}` : ''}
                      </span>
                    ) : null}
                  </div>
                  <div className={train.actions}>
                    {active ? (
                      <Button variant="secondary" label={t('train.stop')} onClick={stopSession} />
                    ) : (
                      <Button
                        label={t('train.record')}
                        disabled={!!session}
                        onClick={() => startSession(label)}
                      />
                    )}
                    {n > 0 && !active ? (
                      <Button
                        variant="danger"
                        label={t(confirmDelete === label ? 'train.confirmDelete' : 'train.delete')}
                        disabled={!!session}
                        onClick={() => void onDelete(label)}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <section className={train.footer}>
            {model.metrics ? (
              <p>{t('train.accuracy', { pct: pct(model.metrics.val_accuracy) })}</p>
            ) : null}
            {model.job?.status === 'failed' ? (
              <p className={train.error}>
                {t('train.failed', { error: model.job.error ?? t('error.generic') })}
              </p>
            ) : null}
            {training ? <p role="status">{t('train.training')}</p> : null}
            <Button
              label={t('train.trainButton')}
              disabled={!canTrain}
              loading={submitting}
              onClick={() => void onTrain()}
            />
            <p className={styles.muted}>{t('train.trainHint')}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
```

> El overlay (`role="status"`) solo existe durante la grabación; "Entrenando…" usa otro `role="status"` fuera del vídeo. En el test de grabación, `getByRole('status')` debe encontrar uno solo: no hay entrenamiento en curso en ese test.

- [ ] **Step 7: Ejecutar**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 8: Commit**

```bash
git add desktop/src/renderer/src
git commit -m "feat(desktop): pantalla Entrenar con grabación por ráfagas, contadores y entrenamiento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ajustes › Datos de entrenamiento

**Files:**
- Create: `desktop/src/renderer/src/routes/settings/TrainingDataSection.tsx`
- Modify: `desktop/src/renderer/src/routes/Settings.tsx`, `desktop/src/renderer/src/i18n/es.ts`
- Test: `desktop/src/renderer/src/__tests__/settings.test.tsx`

**Interfaces:**
- Consumes: `samplesApi.remove()`, `SAMPLES_KEY` (Task 6); `useSignModel` (Task 6).
- Produces: componente `TrainingDataSection`.

- [ ] **Step 1: Textos**

```ts
  'settings.trainingData': 'Datos de entrenamiento',
  'settings.trainingDataHint':
    'Tus muestras y tu modelo se guardan en el servidor, asociados a tu cuenta. Puedes borrarlos cuando quieras.',
  'settings.deleteTrainingData': 'Borrar todos mis datos de entrenamiento',
  'settings.confirmDeleteTrainingData': '¿Seguro? Pulsa otra vez para borrar',
  'settings.trainingDataDeleted': 'Datos de entrenamiento borrados.',
```

- [ ] **Step 2: Test**

En `__tests__/settings.test.tsx`, importar `import { modelsApi, samplesApi } from '@/api/endpoints';` y añadir el test (con espías, sin mockear todo el módulo):

```tsx
  it('borra todos los datos de entrenamiento tras confirmar', async () => {
    const remove = vi.spyOn(samplesApi, 'remove').mockResolvedValue(undefined);
    vi.spyOn(modelsApi, 'status').mockResolvedValue({ ready: null, latest: null });
    renderSettings();
    const button = await screen.findByRole('button', {
      name: 'Borrar todos mis datos de entrenamiento',
    });
    await userEvent.click(button);
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: '¿Seguro? Pulsa otra vez para borrar' }),
    );
    expect(remove).toHaveBeenCalledWith();
    expect(await screen.findByText('Datos de entrenamiento borrados.')).toBeInTheDocument();
  });
```

(`renderSettings` ya existe en ese archivo y no envuelve en `QueryClientProvider`; por eso la sección usa el `queryClient` global, como `Settings.tsx`.)

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `npx vitest run src/renderer/src/__tests__/settings.test.tsx`
Expected: FAIL (no encuentra el botón).

- [ ] **Step 4: Componente**

Crear `routes/settings/TrainingDataSection.tsx`:

```tsx
import { useState } from 'react';

import { SAMPLES_KEY, samplesApi } from '@/api/endpoints';
import { queryClient } from '@/api/queryClient';
import { t } from '@/i18n';
import { useSignModel } from '@/store/signModel';
import { Button } from '@/ui/Button';

import styles from '../routes.module.css';

export function TrainingDataSection() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    setBusy(true);
    try {
      await samplesApi.remove();
      useSignModel.getState().clear();
      await queryClient.invalidateQueries({ queryKey: SAMPLES_KEY });
      await useSignModel.getState().refresh();
      setMessage(t('settings.trainingDataDeleted'));
    } catch {
      setMessage(t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.section} aria-label={t('settings.trainingData')}>
      <h2 className={styles.sectionTitle}>{t('settings.trainingData')}</h2>
      <p className={styles.muted}>{t('settings.trainingDataHint')}</p>
      <Button
        variant="danger"
        label={t(confirming ? 'settings.confirmDeleteTrainingData' : 'settings.deleteTrainingData')}
        loading={busy}
        onClick={() => void onDelete()}
      />
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
```

En `routes/Settings.tsx`: `import { TrainingDataSection } from './settings/TrainingDataSection';` y `<TrainingDataSection />` antes de la sección de perfil.

- [ ] **Step 5: Ejecutar**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: todo en verde.

- [ ] **Step 6: Commit**

```bash
git add desktop/src/renderer/src
git commit -m "feat(desktop): borrar todos los datos de entrenamiento desde Ajustes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentación, comprobaciones y verificación manual

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `README.md`

- [ ] **Step 1: Documentación**

En `docs/ARCHITECTURE.md`:
- En el diagrama, cambiar `Rec -. "F2: secuencias de landmarks (futuro)" .-> API` por `Rec -- "muestras (landmarks)" --> API` y `API -. "F3: modelo entrenado" .-> Rec` por `API -- "pesos GRU (memoria)" --> Rec`; añadir un nodo `Trainer["trainer (PyTorch)"]` conectado a la base de datos.
- Sustituir las secciones "Fase 2" y "Fase 3" del Roadmap por: "**Modelo de señas por usuario — hecho** (spec `docs/superpowers/specs/2026-10-07-trained-sign-model-design.md`, plan `docs/superpowers/plans/2026-10-07-trained-sign-model.md`)".
- Añadir en Decisiones un párrafo **Datos y modelo de señas**: las muestras (solo landmarks) viven en el servidor y se pueden borrar; el servicio `trainer` entrena una GRU con PyTorch CPU; la app ejecuta la GRU en TypeScript puro y guarda los pesos solo en memoria.

En `README.md`:
- Frase inicial: sustituir "La traducción de señas requiere un modelo semántico entrenado, que aún no está incluido" por "Cada usuario entrena su propio modelo de señas desde la pantalla Entrenar".
- En "Uso", añadir el punto **Entrenar**: grabar 20 muestras de Reposo y de al menos 2 frases, pulsar "Entrenar modelo" y esperar a "Listo"; solo se envían landmarks y nada se guarda en el equipo.
- En el arranque del backend, mencionar que `docker compose up` levanta también el servicio `trainer`.
- En Ajustes, mencionar "Borrar todos mis datos de entrenamiento".
- En Seguridad: "Las muestras de señas (solo landmarks, nunca vídeo) y el modelo viven en el servidor; la app mantiene los pesos solo en memoria y los pide con `no-store`."

- [ ] **Step 2: Comprobaciones automáticas**

Run: `cd backend && .venv/Scripts/python -m pytest -q`
Expected: todo en verde.

Run: `cd desktop && npm run lint && npm run typecheck && npx vitest run`
Expected: todo en verde.

- [ ] **Step 3: Empaquetado**

Run: `cd desktop && npm run build:win`
Expected: `release/SenaVoz-Setup-<versión>.exe` generado; `release/win-unpacked/resources/app.asar` unos 12 MB más pequeño que antes (sin `vision_wasm_nosimd_internal.wasm`).

- [ ] **Step 4: Verificación manual**

1. `docker compose up --build`: arrancan `db`, `api` y `trainer`; en los logs del `trainer` no hay errores.
2. `npm run dev`, iniciar sesión, ir a **Entrenar**: se ve la cámara y la lista (Reposo + 9 frases).
3. Grabar 20 muestras de Reposo y de 2 frases (4 sesiones de 5 por etiqueta). Los contadores suben tras cada ráfaga; una ráfaga con las manos fuera de cuadro muestra "No se vieron tus manos".
4. Pulsar **Entrenar modelo**: aparece "Entrenando…" y, en menos de dos minutos, la precisión global y por frase.
5. Ir a **Cámara**: el panel dice "Listo · precisión N %"; cada seña entrenada dice su frase una sola vez; con las manos en reposo no dice nada.
6. **Modo reunión**: una seña entrenada se oye por "CABLE Output" (si VB-Cable está instalado).
7. Comprobar que no hay nada en disco: buscar en `%APPDATA%\SeñaVoz` archivos nuevos que contengan `senavoz-gru-v1` (`findstr /s /m senavoz-gru-v1 "%APPDATA%\SeñaVoz\*"` no devuelve nada).
8. **Ajustes › Borrar todos mis datos de entrenamiento**: tras confirmar, Entrenar muestra 0 muestras y Cámara "Sin modelo".

- [ ] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md README.md
git commit -m "docs: modelo de señas por usuario en arquitectura y README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
