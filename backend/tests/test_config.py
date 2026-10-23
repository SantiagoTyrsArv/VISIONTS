import pytest

from app.core.config import Settings

SECRET = "x" * 32


@pytest.mark.parametrize(
    "url",
    [
        "postgres://u:p@ep-x.neon.tech/db?sslmode=require",
        "postgresql://u:p@ep-x.neon.tech/db?sslmode=require",
    ],
)
def test_urls_de_neon_y_render_usan_psycopg3(url):
    s = Settings(jwt_secret=SECRET, database_url=url)
    assert s.database_url == "postgresql+psycopg://u:p@ep-x.neon.tech/db?sslmode=require"


@pytest.mark.parametrize("url", ["postgresql+psycopg://u:p@h/db", "sqlite://"])
def test_urls_con_driver_explicito_no_cambian(url):
    assert Settings(jwt_secret=SECRET, database_url=url).database_url == url
