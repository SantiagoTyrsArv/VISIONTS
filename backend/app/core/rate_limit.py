from limits import parse
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)


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
