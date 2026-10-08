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
