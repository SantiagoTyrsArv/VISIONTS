from fastapi import APIRouter, HTTPException, Request, Response, status

from app.core.config import get_settings
from app.core.deps import DbSession
from app.core.rate_limit import (
    clear_login_failures,
    limiter,
    login_allowed,
    record_login_failure,
)
from app.schemas.auth import LoginIn, RefreshIn, RegisterIn, TokenPair, UserOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
_settings = get_settings()


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(_settings.rate_limit_register)
def register(request: Request, data: RegisterIn, db: DbSession):
    try:
        return auth_service.register(db, data)
    except auth_service.EmailAlreadyRegistered:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este correo ya está registrado")


@router.post("/login", response_model=TokenPair)
@limiter.limit(_settings.rate_limit_login)
def login(request: Request, data: LoginIn, db: DbSession):
    rate = _settings.rate_limit_login_account
    if not login_allowed(data.email, rate):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Demasiados intentos con esta cuenta. Inténtalo más tarde.",
        )
    try:
        pair = auth_service.login(db, data.email, data.password)
    except auth_service.AuthError as e:
        record_login_failure(data.email, rate)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, e.message)
    clear_login_failures(data.email, rate)
    return pair


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(_settings.rate_limit_refresh)
def refresh(request: Request, data: RefreshIn, db: DbSession):
    try:
        return auth_service.refresh(db, data.refresh_token)
    except auth_service.AuthError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, e.message)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(data: RefreshIn, db: DbSession):
    auth_service.logout(db, data.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
