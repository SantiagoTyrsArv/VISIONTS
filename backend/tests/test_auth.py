from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.rate_limit import limiter
from app.core.security import hash_refresh_token
from app.db.models import RefreshToken, User

from .conftest import USER


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# --- registro ---------------------------------------------------------------


def test_register_ok_lowercases_email_and_hides_hash(client, db_session):
    r = client.post("/auth/register", json=USER)
    assert r.status_code == 201
    body = r.json()
    assert body["email"] == "ana@example.com"
    assert body["display_name"] == "Ana"
    assert "password" not in body and "password_hash" not in body
    stored = db_session.scalar(select(User))
    assert stored.password_hash.startswith("$argon2")


def test_register_duplicate_email_case_insensitive(client, registered):
    r = client.post("/auth/register", json={**USER, "email": "ANA@example.com"})
    assert r.status_code == 409


def test_register_rejects_weak_passwords(client):
    for pw in ("corta1", "sololetrasaqui", "123456789"):
        r = client.post("/auth/register", json={**USER, "password": pw})
        assert r.status_code == 422, pw


# --- login ------------------------------------------------------------------


def test_login_ok(client, registered):
    r = client.post("/auth/login", json={"email": "ana@example.com", "password": "clave1234"})
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 15 * 60
    assert body["access_token"] and body["refresh_token"]


def test_login_wrong_password_and_unknown_email_are_indistinguishable(client, registered):
    bad_pw = client.post("/auth/login", json={"email": "ana@example.com", "password": "otra12345"})
    no_user = client.post("/auth/login", json={"email": "nadie@example.com", "password": "otra12345"})
    assert bad_pw.status_code == no_user.status_code == 401
    assert bad_pw.json() == no_user.json()


def test_login_rate_limited(client, registered):
    limiter.enabled = True
    limiter.reset()
    try:
        codes = [
            client.post(
                "/auth/login", json={"email": "ana@example.com", "password": "mala12345"}
            ).status_code
            for _ in range(7)
        ]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:5] == [401] * 5
    assert 429 in codes[5:]


# --- /users/me --------------------------------------------------------------


def test_me_with_token(client, tokens):
    r = client.get("/users/me", headers=auth(tokens["access_token"]))
    assert r.status_code == 200
    assert r.json()["email"] == "ana@example.com"


def test_me_without_or_with_bad_token(client, tokens):
    assert client.get("/users/me").status_code == 401
    assert client.get("/users/me", headers=auth("basura")).status_code == 401
    # un refresh token no sirve como access token
    assert client.get("/users/me", headers=auth(tokens["refresh_token"])).status_code == 401


# --- refresh ----------------------------------------------------------------


def test_refresh_rotates_and_invalidates_old_token(client, tokens, db_session):
    old = tokens["refresh_token"]
    r = client.post("/auth/refresh", json={"refresh_token": old})
    assert r.status_code == 200
    new = r.json()
    assert new["refresh_token"] != old
    assert client.get("/users/me", headers=auth(new["access_token"])).status_code == 200

    old_row = db_session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(old))
    )
    assert old_row.revoked_at is not None and old_row.replaced_by is not None


def test_refresh_reuse_revokes_all_sessions(client, tokens):
    old = tokens["refresh_token"]
    new = client.post("/auth/refresh", json={"refresh_token": old}).json()

    # Reutilizar el token ya rotado => rechazo y revocación de toda la familia.
    reuse = client.post("/auth/refresh", json={"refresh_token": old})
    assert reuse.status_code == 401

    # El token nuevo (legítimo) también quedó revocado.
    r = client.post("/auth/refresh", json={"refresh_token": new["refresh_token"]})
    assert r.status_code == 401


def test_refresh_unknown_token(client):
    assert client.post("/auth/refresh", json={"refresh_token": "nope"}).status_code == 401


def test_refresh_expired_token(client, tokens, db_session):
    row = db_session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(tokens["refresh_token"])
        )
    )
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    db_session.commit()
    assert (
        client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code
        == 401
    )


def test_refresh_token_stored_hashed(tokens, db_session):
    row = db_session.scalar(select(RefreshToken))
    assert row.token_hash == hash_refresh_token(tokens["refresh_token"])
    assert row.token_hash != tokens["refresh_token"]


# --- logout -----------------------------------------------------------------


def test_logout_revokes_refresh_token(client, tokens):
    r = client.post("/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 204
    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401


def test_logout_is_idempotent_for_unknown_token(client):
    assert client.post("/auth/logout", json={"refresh_token": "nope"}).status_code == 204
