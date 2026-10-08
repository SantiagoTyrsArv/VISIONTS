import os

# Debe fijarse antes de importar la app (Settings se lee al importar).
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret-1234")
os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rate_limit import limiter
from app.db import models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services.phrase_service import seed_default_phrases


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as session:
        yield session
    engine.dispose()


@pytest.fixture()
def client(db_session):
    def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    limiter.enabled = False
    limiter.reset()
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def seeded(db_session):
    seed_default_phrases(db_session)


USER = {"email": "Ana@Example.com", "password": "clave1234", "display_name": "Ana"}


@pytest.fixture()
def registered(client):
    r = client.post("/auth/register", json=USER)
    assert r.status_code == 201
    return USER


@pytest.fixture()
def tokens(client, registered):
    r = client.post(
        "/auth/login", json={"email": registered["email"], "password": registered["password"]}
    )
    assert r.status_code == 200
    return r.json()


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
