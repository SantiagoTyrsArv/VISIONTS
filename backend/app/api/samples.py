from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.deps import get_current_user
from app.core.rate_limit import limiter, user_or_ip
from app.db.models import User
from app.db.session import get_db
from app.schemas.samples import SampleCreated, SampleIn, SampleSummary
from app.services import sample_service

router = APIRouter(prefix="/samples", tags=["samples"])
_settings = get_settings()


@router.post("", response_model=SampleCreated, status_code=status.HTTP_201_CREATED)
@limiter.limit(_settings.rate_limit_samples, key_func=user_or_ip)
def create_sample(
    request: Request,
    data: SampleIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        sample = sample_service.create_sample(db, user.id, data.label, data.frames)
    except sample_service.UnknownLabel:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Etiqueta desconocida")
    except sample_service.LabelFull:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya tienes 100 muestras de esta frase")
    return {"id": sample.id}


@router.get("/summary", response_model=SampleSummary)
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"counts": sample_service.counts(db, user.id)}


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_samples(
    label: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    sample_service.delete_samples(db, user.id, label)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
