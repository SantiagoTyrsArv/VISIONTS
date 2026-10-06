from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.db.models import RefreshToken, User
from app.schemas.auth import RegisterIn, TokenPair


class AuthError(Exception):
    """Error de autenticación con mensaje genérico apto para el cliente."""

    def __init__(self, message: str = "Credenciales inválidas") -> None:
        super().__init__(message)
        self.message = message


class EmailAlreadyRegistered(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    # SQLite devuelve datetimes ingenuos; Postgres los devuelve con zona.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def register(db: Session, data: RegisterIn) -> User:
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        display_name=data.display_name,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise EmailAlreadyRegistered()
    return user


def _issue_pair(db: Session, user: User) -> tuple[TokenPair, RefreshToken]:
    s = get_settings()
    raw = generate_refresh_token()
    row = RefreshToken(
        user_id=user.id,
        token_hash=hash_refresh_token(raw),
        expires_at=_now() + timedelta(days=s.refresh_token_days),
    )
    db.add(row)
    db.flush()
    pair = TokenPair(
        access_token=create_access_token(str(user.id)),
        refresh_token=raw,
        expires_in=s.access_token_minutes * 60,
    )
    return pair, row


def login(db: Session, email: str, password: str) -> TokenPair:
    user = db.scalar(select(User).where(User.email == email))
    ok = verify_password(password, user.password_hash if user else None)
    if not ok or user is None or not user.is_active:
        raise AuthError("Correo o contraseña incorrectos")
    pair, _ = _issue_pair(db, user)
    db.commit()
    return pair


def _revoke_all(db: Session, user_id: object) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=_now())
    )


def refresh(db: Session, raw_token: str) -> TokenPair:
    row = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )
    if row is None:
        raise AuthError("Sesión inválida")

    if row.revoked_at is not None:
        # Reutilización de un token ya rotado/revocado: posible robo. Se cierran
        # todas las sesiones del usuario y se persiste antes de rechazar.
        _revoke_all(db, row.user_id)
        db.commit()
        raise AuthError("Sesión inválida")

    if _aware(row.expires_at) <= _now():
        raise AuthError("Sesión expirada")

    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AuthError("Sesión inválida")

    pair, new_row = _issue_pair(db, user)
    row.revoked_at = _now()
    row.replaced_by = new_row.id
    db.commit()
    return pair


def logout(db: Session, raw_token: str) -> None:
    """Idempotente: revoca el refresh token si existe y sigue activo."""
    row = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )
    if row is not None and row.revoked_at is None:
        row.revoked_at = _now()
        db.commit()
