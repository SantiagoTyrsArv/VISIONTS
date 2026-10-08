"""Servicio trainer: entrena los modelos en cola. Uso: python -m app.training.worker"""

import logging
import time
from collections.abc import Callable

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.services import model_service
from app.training.data import load_training_set
from app.training.errors import TrainingTimeout

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
    job_id, user_id = job.id, job.user_id
    try:
        # Se vuelve a comprobar: el usuario pudo borrar muestras mientras esperaba en cola.
        labels = model_service.trainable_labels(db, user_id)
    except model_service.NotEnoughSamples as e:
        model_service.fail(db, job_id, "Faltan muestras para entrenar: " + ", ".join(e.missing))
        return True
    log.info("Entrenando modelo %s (%s)", job_id, ", ".join(labels))
    try:
        result = train_fn(load_training_set(db, user_id, labels))
        model_service.finish(db, job, labels, result.weights, result.metrics)
        log.info("Modelo %s listo", job_id)
    except Exception as e:  # cualquier fallo deja el trabajo en `failed`, nunca colgado
        db.rollback()
        log.exception("Falló el entrenamiento %s", job_id)
        # Al usuario solo le llega un mensaje controlado; el detalle queda en el log.
        message = str(e) if isinstance(e, TrainingTimeout) else "No se pudo entrenar el modelo"
        model_service.fail(db, job_id, message)
    return True


def poll(db: Session, recover: bool, train_fn: Callable = _default_train) -> bool:
    """Una vuelta del bucle; con `recover`, antes marca como fallido lo que quedó colgado."""
    if recover:
        n = model_service.recover_interrupted(db)
        if n:
            log.warning("%d entrenamientos interrumpidos marcados como fallidos", n)
    return run_once(db, train_fn)


def main() -> None:
    from app.db.session import SessionLocal

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    # Hay un solo worker: lo que siga en `training` mientras no entrena está colgado.
    recover = True
    while True:
        try:
            with SessionLocal() as db:
                worked = poll(db, recover)
                recover = False
                if worked:
                    continue
        except SQLAlchemyError:
            # Base de datos no disponible o sin migrar: se reintenta y, al volver, se recupera
            # el trabajo que no se pudo cerrar.
            log.exception("Error de base de datos; reintentando")
            recover = True
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
