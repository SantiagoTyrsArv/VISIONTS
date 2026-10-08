from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter, user_or_ip
from app.db.models import User
from app.db.session import get_db
from app.schemas.samples import ModelStatusOut
from app.services import model_service

router = APIRouter(prefix="/models", tags=["models"])
_settings = get_settings()


@router.post("/train", status_code=status.HTTP_202_ACCEPTED)
# Cada entrenamiento ocupa la CPU del trainer hasta 5 minutos.
@limiter.limit(_settings.rate_limit_train, key_func=user_or_ip)
def train(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job = model_service.enqueue(db, user.id)
    except model_service.TrainingInProgress:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay un entrenamiento en curso")
    except model_service.NotEnoughSamples as e:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Faltan muestras: " + ", ".join(e.missing),
        )
    return {"id": str(job.id), "status": job.status}


@router.get("/status", response_model=ModelStatusOut)
def model_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return model_service.status(db, user.id)


@router.get("/ready/weights")
def ready_weights(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    weights = model_service.ready_weights(db, user.id)
    if weights is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay ningún modelo listo")
    # Pesos derivados de los datos de la persona: que nadie los guarde en caché.
    return JSONResponse(weights, headers={"Cache-Control": "no-store"})
