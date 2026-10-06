import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture()
def cors_client(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173,app://senavoz")
    get_settings.cache_clear()
    try:
        with TestClient(create_app()) as c:
            yield c
    finally:
        get_settings.cache_clear()


def _preflight(client, origin):
    return client.options(
        "/auth/login",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )


@pytest.mark.parametrize("origin", ["app://senavoz", "http://localhost:5173"])
def test_preflight_permite_origenes_de_escritorio(cors_client, origin):
    r = _preflight(cors_client, origin)
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] == origin


def test_preflight_rechaza_origen_no_listado(cors_client):
    r = _preflight(cors_client, "https://evil.example")
    assert "access-control-allow-origin" not in r.headers
