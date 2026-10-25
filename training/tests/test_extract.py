import json
import zipfile
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

from senavoz_training.extract import extract_all, extract_video, hold_missing, member_name
from senavoz_training.preprocess import assign_slots, normalize_frame

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json"
)
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_assign_slots_matches_app(case):
    hands = [
        (np.array([[p["x"], p["y"], p["z"]] for p in h["landmarks"]], np.float64).reshape(-1, 3),
         h.get("handedness"))
        for h in case["hands"]
    ]
    out = normalize_frame(*assign_slots(hands))
    np.testing.assert_allclose(out, np.array(case["expected"], np.float32), atol=1e-6)


def test_hold_missing_keeps_last_hand_up_to_limit():
    seq = np.zeros((6, 126), np.float32)
    seq[0, :63] = 1.0
    out = hold_missing(seq, 3)
    assert (out[1:4, :63] == 1.0).all()
    assert not out[4:].any()
    assert not seq[1:].any()  # no modifica la entrada


def test_hold_missing_restarts_count_when_hand_returns():
    seq = np.zeros((7, 126), np.float32)
    seq[0, 63:] = 1.0
    seq[2, 63:] = 2.0
    out = hold_missing(seq, 3)
    assert (out[1, 63:] == 1.0).all()
    assert (out[3:6, 63:] == 2.0).all()
    assert not out[6].any()


def _write_video(path, n_frames, fps=30):
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), fps, (64, 48))
    for k in range(n_frames):
        writer.write(np.full((48, 64, 3), (k * 7) % 255, np.uint8))
    writer.release()


def _result(*hands):
    """Resultado de HandLandmarker construido a mano: hands = (handedness, x de la muñeca)."""
    return SimpleNamespace(
        hand_landmarks=[
            [SimpleNamespace(x=wx + i * 0.01, y=0.5 - i * 0.02, z=0.0) for i in range(21)]
            for _, wx in hands
        ],
        handedness=[[SimpleNamespace(category_name=h)] for h, _ in hands],
    )


class FakeLandmarker:
    def __init__(self, script):
        self.script = script
        self.timestamps = []

    def detect_for_video(self, image, timestamp_ms):
        self.timestamps.append(timestamp_ms)
        return self.script(len(self.timestamps) - 1)


def test_extract_detects_every_frame_and_keeps_one_in_two(tmp_path):
    video = tmp_path / "v.avi"
    _write_video(video, 10)
    fake = FakeLandmarker(lambda k: _result(("Right", 0.3)))
    seq = extract_video(video, fake)
    assert len(fake.timestamps) == 10
    assert all(a < b for a, b in zip(fake.timestamps, fake.timestamps[1:]))
    assert seq.shape == (5, 126)
    assert seq.dtype == np.float32
    # Right → posición 1, como en la app
    assert not seq[:, :63].any()
    assert seq[:, 63:].any()


def test_extract_holds_a_lost_hand_like_the_app(tmp_path):
    video = tmp_path / "v.avi"
    _write_video(video, 14)
    fake = FakeLandmarker(lambda k: _result(("Left", 0.6)) if k == 0 else _result())
    seq = extract_video(video, fake)
    assert seq.shape == (7, 126)
    assert (seq[1:4] == seq[0]).all()
    assert seq[0, :63].any()
    assert not seq[4:].any()


def test_member_name_repairs_utf8_names_without_flag():
    raw = "Videos Courtesy/1/Cordialidad/Baño/0.avi".encode("utf-8").decode("cp437")
    assert member_name(raw, 0) == "Videos Courtesy/1/Cordialidad/Baño/0.avi"
    assert member_name("a/Baño.avi", 0x800) == "a/Baño.avi"


def test_extract_all_writes_cache_and_skips_done(tmp_path):
    video = tmp_path / "v.avi"
    _write_video(video, 6)
    zips = tmp_path / "zips"
    zips.mkdir()
    with zipfile.ZipFile(zips / "Videos Courtesy.zip", "w") as zf:
        zf.writestr("Videos Courtesy/1/", "")
        zf.write(video, "Videos Courtesy/1/Cordialidad/Hola/0.avi")
        zf.write(video, "Videos Courtesy/12/Cordialidad/Hola/3.avi")
    created = []

    def factory():
        created.append(1)
        return FakeLandmarker(lambda k: _result(("Left", 0.5)))

    cache = tmp_path / "cache"
    extract_all(zips, cache, make_landmarker=factory, workers=1)
    out = cache / "Cordialidad" / "Hola" / "1__0.npy"
    assert out.exists()
    assert (cache / "Cordialidad" / "Hola" / "12__3.npy").exists()
    assert np.load(out).shape == (3, 126)
    assert len(created) == 2

    extract_all(zips, cache, make_landmarker=factory, workers=1)
    assert len(created) == 2  # ya estaban en la caché
