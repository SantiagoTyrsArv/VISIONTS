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
