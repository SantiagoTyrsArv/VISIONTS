from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.db.models import User
from app.schemas.auth import UserOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
