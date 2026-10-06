from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.phrase import PhraseOut
from app.services import phrase_service

router = APIRouter(prefix="/phrases", tags=["phrases"])


@router.get("", response_model=list[PhraseOut])
def list_phrases(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return phrase_service.list_phrases(db)
