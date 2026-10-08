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


def test_only_one_active_job_per_user_in_db(db_session, registered):
    import pytest
    from sqlalchemy.exc import IntegrityError

    user = _user(db_session)
    db_session.add(SignModel(user_id=user.id, status="queued", labels=["a"]))
    db_session.commit()
    db_session.add(SignModel(user_id=user.id, status="training", labels=["a"]))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_concurrent_enqueue_maps_to_conflict(client, auth, seeded, db_session, monkeypatch):
    from app.services import model_service

    user = _user(db_session)
    _enough(db_session, user.id)
    db_session.add(SignModel(user_id=user.id, status="queued", labels=["neutral"]))
    db_session.commit()
    # Simula la carrera: la comprobación previa no ve el trabajo activo.
    monkeypatch.setattr(model_service, "_active_job", lambda db, user_id: None)
    assert client.post("/models/train", headers=auth).status_code == 409


def test_train_is_rate_limited(client, auth, seeded, db_session):
    from app.core.rate_limit import limiter

    limiter.enabled = True
    limiter.reset()
    try:
        codes = [client.post("/models/train", headers=auth).status_code for _ in range(11)]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:10] == [422] * 10
    assert codes[10] == 429
