from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api import auth, health, models, phrases, samples, users
from app.core.config import get_settings
from app.core.rate_limit import limiter


def _validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Sin devolver la entrada: puede traer NaN (no serializable en JSON) o miles de valores.
    detail = [{k: e[k] for k in ("type", "loc", "msg") if k in e} for e in exc.errors()]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": detail}
    )


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="SeñaVoz API", version="0.1.0")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    routers = (health, auth, users, phrases, samples, models)
    for r in (m.router for m in routers):
        app.include_router(r)
    return app


app = create_app()
