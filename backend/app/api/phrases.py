from fastapi import APIRouter

from app.core.deps import CurrentUser, DbSession
from app.schemas.phrase import PhraseOut
from app.services import phrase_service

router = APIRouter(prefix="/phrases", tags=["phrases"])


@router.get("", response_model=list[PhraseOut])
def list_phrases(_: CurrentUser, db: DbSession):
    return phrase_service.list_phrases(db)
