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
