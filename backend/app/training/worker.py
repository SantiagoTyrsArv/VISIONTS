"""Servicio trainer: entrena los modelos en cola. Uso: python -m app.training.worker"""

import logging
import time
from collections.abc import Callable

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.services import model_service
from app.training.data import load_training_set

log = logging.getLogger("senavoz.trainer")
POLL_SECONDS = 3


def _default_train(samples):
    from app.training.train import train_model

    return train_model(samples)


def run_once(db: Session, train_fn: Callable = _default_train) -> bool:
    """Procesa un trabajo si lo hay. Devuelve False si la cola estaba vacía."""
    job = model_service.claim_next(db)
    if job is None:
        return False
    job_id, user_id, labels = job.id, job.user_id, list(job.labels)
    log.info("Entrenando modelo %s (%s)", job_id, ", ".join(labels))
    try:
        result = train_fn(load_training_set(db, user_id, labels))
        model_service.finish(db, job, result.weights, result.metrics)
        log.info("Modelo %s listo", job_id)
    except Exception as e:  # cualquier fallo deja el trabajo en `failed`, nunca colgado
        db.rollback()
        log.exception("Falló el entrenamiento %s", job_id)
        model_service.fail(db, job_id, f"No se pudo entrenar el modelo: {e}")
    return True


def main() -> None:
    from app.db.session import SessionLocal

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    recovered = False
    while True:
        try:
            with SessionLocal() as db:
                if not recovered:
                    n = model_service.recover_interrupted(db)
                    recovered = True
                    if n:
                        log.warning("%d entrenamientos interrumpidos marcados como fallidos", n)
                if run_once(db):
                    continue
        except SQLAlchemyError:
            # Base de datos aún sin migrar o no disponible: se reintenta.
            log.exception("Error de base de datos; reintentando")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
