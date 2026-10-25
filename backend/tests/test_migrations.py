from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core.config import get_settings

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture
def alembic_cfg(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'm.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    try:
        yield cfg, url
    finally:
        get_settings.cache_clear()


def _tables(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_0004_sube_y_baja(alembic_cfg):
    cfg, url = alembic_cfg
    command.upgrade(cfg, "head")
    assert {"users", "phrases"} <= _tables(url)
    assert not {"sign_samples", "sign_models"} & _tables(url)

    command.downgrade(cfg, "0003")
    assert {"sign_samples", "sign_models"} <= _tables(url)

    command.upgrade(cfg, "head")
    assert not {"sign_samples", "sign_models"} & _tables(url)
