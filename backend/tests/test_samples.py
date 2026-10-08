import struct

from sqlalchemy import select

from app.db.models import SignModel, SignSample, User
from tests.conftest import USER, add_samples, auth_headers

FRAMES = [0.0] * 3780


def _user(db, email=USER["email"]):
    return db.scalar(select(User).where(User.email == email.lower()))


def test_requires_auth(client, seeded):
    assert client.post("/samples", json={"label": "yes", "frames": FRAMES}).status_code == 401
    assert client.get("/samples/summary").status_code == 401


def test_create_sample_stores_float32(client, auth, seeded, db_session):
    frames = [0.5] * 3780
    r = client.post("/samples", json={"label": "yes", "frames": frames}, headers=auth)
    assert r.status_code == 201
    row = db_session.scalar(select(SignSample))
    assert row.label == "yes"
    assert len(row.data) == 3780 * 4
    assert struct.unpack("<3780f", row.data)[0] == 0.5


def test_neutral_label_is_valid(client, auth, seeded):
    r = client.post("/samples", json={"label": "neutral", "frames": FRAMES}, headers=auth)
    assert r.status_code == 201


def test_unknown_label_rejected(client, auth, seeded):
    r = client.post("/samples", json={"label": "pizza", "frames": FRAMES}, headers=auth)
    assert r.status_code == 422


def test_wrong_length_rejected(client, auth, seeded):
    r = client.post("/samples", json={"label": "yes", "frames": [0.0] * 3779}, headers=auth)
    assert r.status_code == 422


def test_out_of_range_rejected(client, auth, seeded):
    frames = [0.0] * 3779 + [2.5]
    r = client.post("/samples", json={"label": "yes", "frames": frames}, headers=auth)
    assert r.status_code == 422


def test_non_finite_rejected(client, auth, seeded):
    body = '{"label": "yes", "frames": [' + ",".join(["0"] * 3779 + ["NaN"]) + "]}"
    headers = {**auth, "Content-Type": "application/json"}
    r = client.post("/samples", content=body, headers=headers)
    assert r.status_code == 422


def test_cap_per_label(client, auth, seeded, db_session):
    add_samples(db_session, _user(db_session).id, "yes", 100)
    r = client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    assert r.status_code == 409


def test_summary_counts_only_own_samples(client, auth, seeded, db_session):
    other = auth_headers(client, "otro@example.com")
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "no", "frames": FRAMES}, headers=other)
    assert client.get("/samples/summary", headers=auth).json() == {"counts": {"yes": 2}}
    assert client.get("/samples/summary", headers=other).json() == {"counts": {"no": 1}}


def test_delete_by_label_only_touches_own(client, auth, seeded, db_session):
    other = auth_headers(client, "otro@example.com")
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "no", "frames": FRAMES}, headers=auth)
    client.post("/samples", json={"label": "yes", "frames": FRAMES}, headers=other)
    assert client.delete("/samples", params={"label": "yes"}, headers=auth).status_code == 204
    assert client.get("/samples/summary", headers=auth).json() == {"counts": {"no": 1}}
    assert client.get("/samples/summary", headers=other).json() == {"counts": {"yes": 1}}


def test_delete_all_removes_samples_and_models(client, auth, seeded, db_session):
    user = _user(db_session)
    add_samples(db_session, user.id, "yes", 3)
    db_session.add(SignModel(user_id=user.id, status="ready", labels=["neutral", "yes"]))
    db_session.commit()
    assert client.delete("/samples", headers=auth).status_code == 204
    assert db_session.scalars(select(SignSample)).all() == []
    assert db_session.scalars(select(SignModel)).all() == []


def test_deleting_user_cascades(db_session, client, registered, seeded):
    user = _user(db_session)
    add_samples(db_session, user.id, "yes", 2)
    db_session.delete(user)
    db_session.commit()
    assert db_session.scalars(select(SignSample)).all() == []
