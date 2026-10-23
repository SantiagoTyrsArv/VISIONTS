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



# Fallos de login por cuenta (correo). A diferencia del límite por IP, no depende de
# X-Forwarded-For, que el cliente puede falsificar detrás de un proxy. Solo cuentan los fallos y un
# acierto los borra: así un tercero necesita `rate` fallos para bloquear una cuenta (riesgo aceptado,
# ver README) y quien entra a menudo no se bloquea a sí mismo.
def _account_key(email: str) -> str:
    return email.strip().lower()


def login_allowed(email: str, rate: str) -> bool:
    return not limiter.enabled or limiter.limiter.test(parse(rate), "login-fail", _account_key(email))


def record_login_failure(email: str, rate: str) -> None:
    if limiter.enabled:
        limiter.limiter.hit(parse(rate), "login-fail", _account_key(email))


def clear_login_failures(email: str, rate: str) -> None:
    if limiter.enabled:
        limiter.limiter.clear(parse(rate), "login-fail", _account_key(email))
