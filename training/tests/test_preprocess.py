import json
from pathlib import Path

import numpy as np
import pytest

from senavoz_training.preprocess import normalize_frame, normalize_hand

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json"
)
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def _points(hand):
    return np.array([[p["x"], p["y"], p["z"]] for p in hand["landmarks"]], np.float64)


def _slots(hands):
    """Misma asignación que la app: Left → 0, Right → 1, si no la primera libre."""
    slots = [None, None]
    taken = [False, False]
    for h in hands:
        if len(h["landmarks"]) != 21:
            continue
        side = {"Left": 0, "Right": 1}.get(h.get("handedness"))
        if side is None or taken[side]:
            side = taken.index(False) if False in taken else None
        if side is None:
            break
        taken[side] = True
        slots[side] = _points(h)
    return slots


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parity_with_app(case):
    left, right = _slots(case["hands"])
    out = normalize_frame(left, right)
    assert out.shape == (126,)
    assert out.dtype == np.float32
    np.testing.assert_allclose(out, np.array(case["expected"], np.float32), atol=1e-6)


def test_degenerate_hand_is_none():
    assert normalize_hand(np.full((21, 3), 0.5)) is None


def test_missing_hand_is_zeros():
    assert not normalize_frame(None, None).any()


def test_nan_hand_is_zeros():
    """Una mano con una coordenada NaN se trata como ausente (igual que la app)."""
    pts = np.random.default_rng(0).random((21, 3))
    pts[5, 1] = np.nan
    assert normalize_hand(pts) is None
    assert not normalize_frame(pts, None).any()
