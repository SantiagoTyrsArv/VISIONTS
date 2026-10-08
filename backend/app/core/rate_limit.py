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
