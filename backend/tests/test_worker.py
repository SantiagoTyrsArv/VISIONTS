from sqlalchemy import select

from app.db.models import SignModel, User
from app.services import model_service
from app.training.train import TrainResult
from app.training.worker import run_once
from tests.conftest import USER, add_samples


def _user(db):
    return db.scalar(select(User).where(User.email == USER["email"].lower()))


def _queue(db, labels=("neutral", "no", "yes")):
    user = _user(db)
    for label in labels:
        add_samples(db, user.id, label, 20)
    job = SignModel(user_id=user.id, status="queued", labels=list(labels))
    db.add(job)
    db.commit()
    return job


def test_run_once_without_jobs(db_session):
    assert run_once(db_session, train_fn=lambda s: None) is False


def test_run_once_trains_and_marks_ready(db_session, registered, client, seeded):
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
    assert seen == {"neutral": (20, 30, 126), "no": (20, 30, 126), "yes": (20, 30, 126)}


def test_new_ready_model_replaces_previous(db_session, registered, client, seeded):
    user = _user(db_session)
    old = SignModel(user_id=user.id, status="ready", labels=["neutral", "yes"], metrics={})
    db_session.add(old)
    db_session.commit()
    _queue(db_session)
    run_once(db_session, train_fn=lambda s: TrainResult(weights={}, metrics={}))
    statuses = [m.status for m in db_session.scalars(select(SignModel))]
    assert statuses == ["ready"]


def test_run_once_marks_failed_on_error(db_session, registered, client, seeded):
    job = _queue(db_session)

    def boom(samples):
        raise RuntimeError("sin memoria")

    assert run_once(db_session, train_fn=boom) is True
    db_session.refresh(job)
    assert job.status == "failed"
    assert job.error == "No se pudo entrenar el modelo"


def test_recover_interrupted(db_session, registered, client, seeded):
    job = _queue(db_session)
    job.status = "training"
    db_session.commit()
    assert model_service.recover_interrupted(db_session) == 1
    db_session.refresh(job)
    assert (job.status, job.error) == ("failed", "Entrenamiento interrumpido")


def test_error_detail_is_not_exposed(db_session, registered, client, seeded):
    job = _queue(db_session)

    def boom(samples):
        raise RuntimeError("psycopg: host=db port=5432 SELECT ...")

    run_once(db_session, train_fn=boom)
    db_session.refresh(job)
    assert job.error == "No se pudo entrenar el modelo"


def test_timeout_message_is_kept(db_session, registered, client, seeded):
    from app.training.train import TrainingTimeout

    job = _queue(db_session)

    def slow(samples):
        raise TrainingTimeout("El entrenamiento superó el tiempo máximo")

    run_once(db_session, train_fn=slow)
    db_session.refresh(job)
    assert job.error == "El entrenamiento superó el tiempo máximo"


def test_fails_if_samples_were_deleted_after_queueing(db_session, registered, client, seeded):
    job = _queue(db_session, labels=("neutral", "yes", "no"))
    from app.services import sample_service

    sample_service.delete_samples(db_session, job.user_id, "neutral")
    called = []
    assert run_once(db_session, train_fn=lambda s: called.append(s)) is True
    db_session.refresh(job)
    assert called == []
    assert (job.status, job.error) == ("failed", "Faltan muestras para entrenar: neutral")


def test_trains_only_labels_still_at_minimum(db_session, registered, client, seeded):
    job = _queue(db_session, labels=("neutral", "yes", "no", "thanks"))
    from sqlalchemy import delete

    from app.db.models import SignSample

    one = db_session.scalar(select(SignSample.id).where(SignSample.label == "thanks"))
    db_session.execute(delete(SignSample).where(SignSample.id == one))
    db_session.commit()
    seen = []

    def fake_train(samples):
        seen.extend(sorted(samples))
        return TrainResult(weights={}, metrics={})

    run_once(db_session, train_fn=fake_train)
    db_session.refresh(job)
    assert seen == ["neutral", "no", "yes"]
    assert job.labels == ["neutral", "no", "yes"]


def test_poll_recovers_orphaned_training_after_db_error(db_session, registered, client, seeded):
    from app.training.worker import poll

    job = _queue(db_session)
    job.status = "training"
    db_session.commit()
    poll(db_session, recover=True, train_fn=lambda s: None)
    db_session.refresh(job)
    assert job.status == "failed"


def test_fail_error_does_not_escape_unhandled(db_session, registered, client, seeded, monkeypatch):
    """Si tampoco se puede marcar como fallido, el error llega al bucle para que recupere."""
    import pytest
    from sqlalchemy.exc import OperationalError

    _queue(db_session)

    def broken(*a, **k):
        raise OperationalError("UPDATE", {}, Exception("conexión perdida"))

    monkeypatch.setattr(model_service, "fail", broken)

    def boom(samples):
        raise OperationalError("SELECT", {}, Exception("conexión perdida"))

    with pytest.raises(OperationalError):
        run_once(db_session, train_fn=boom)
