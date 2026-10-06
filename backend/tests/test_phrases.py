from sqlalchemy import func, select

from app.db.models import Phrase
from app.services.phrase_service import DEFAULT_PHRASES, seed_default_phrases


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_phrases_requires_auth(client, seeded):
    assert client.get("/phrases").status_code == 401


def test_phrases_list(client, tokens, seeded):
    r = client.get("/phrases", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r.status_code == 200
    data = r.json()
    assert [p["code"] for p in data] == [c for c, _ in DEFAULT_PHRASES]
    assert next(p for p in data if p["code"] == "yes")["text_es"] == "Sí"


def test_seed_is_idempotent(db_session):
    assert seed_default_phrases(db_session) == len(DEFAULT_PHRASES)
    assert seed_default_phrases(db_session) == 0
    assert db_session.scalar(select(func.count()).select_from(Phrase)) == len(DEFAULT_PHRASES)
