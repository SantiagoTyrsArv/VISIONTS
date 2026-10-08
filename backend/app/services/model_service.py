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
