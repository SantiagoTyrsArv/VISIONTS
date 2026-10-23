from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from typing import Annotated


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://senavoz:senavoz@localhost:5432/senavoz"
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    # NoDecode: pydantic-settings no intenta parsear JSON; se separa por comas.
    cors_origins: Annotated[list[str], NoDecode] = []
    rate_limit_login: str = "5/minute"
    # Por cuenta (correo), además de por IP: la IP tras el proxy se puede falsificar.
    rate_limit_login_account: str = "10/hour"
    rate_limit_register: str = "10/minute"
    rate_limit_refresh: str = "30/minute"

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        # Neon y Render dan URLs `postgres://` o `postgresql://`, que SQLAlchemy asocia a psycopg2
        # (no instalado). Se fuerza el driver psycopg 3; la query (sslmode=require...) se conserva.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v.removeprefix(prefix)
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
