from limits import parse
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.core.security import decode_access_token

limiter = Limiter(key_func=get_remote_address)


def user_or_ip(request: Request) -> str:
    """Clave de límite por usuario autenticado; sin token válido, por IP."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        sub = decode_access_token(auth[7:])
        if sub:
            return f"user:{sub}"
    return get_remote_address(request)


def account_attempt_allowed(scope: str, account: str, rate: str) -> bool:
    """Cuenta un intento sobre una cuenta (p. ej. el correo del login) y dice si aún cabe en
    `rate`. A diferencia del límite por IP, no depende de X-Forwarded-For, que el cliente puede
    falsificar detrás de un proxy: frena la fuerza bruta contra una cuenta concreta."""
    if not limiter.enabled:
        return True
    return limiter.limiter.hit(parse(rate), scope, account.strip().lower())
