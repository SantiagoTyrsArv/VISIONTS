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
