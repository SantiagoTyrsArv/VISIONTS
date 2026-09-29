from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.schemas.auth import LoginIn, RefreshIn, RegisterIn, TokenPair, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
_settings = get_settings()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_settings.rate_limit_register)
def register(request: Request, data: RegisterIn, db: Session = Depends(get_db)):
    try:
        return auth_service.register(db, data)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este correo ya está registrado")


@router.post("/login", response_model=TokenPair)
@limiter.limit(_settings.rate_limit_login)
def login(request: Request, data: LoginIn, db: Session = Depends(get_db)):
    try:
        return auth_service.login(db, data.email, data.password)
    except auth_service.AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, e.message)


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(_settings.rate_limit_refresh)
def refresh(request: Request, data: RefreshIn, db: Session = Depends(get_db)):
    try:
        return auth_service.refresh(db, data.refresh_token)
    except auth_service.AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, e.message)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(data: RefreshIn, db: Session = Depends(get_db)):
    auth_service.logout(db, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
