import numpy as np

from senavoz_training.labels import NEUTRAL, SIGN_TO_CODE
from senavoz_training.neutral import make_neutral


def test_neutral_mixes_zeros_and_still_hands():
    rng = np.random.default_rng(0)
    still = np.ones((5, 126), np.float32)
    out = make_neutral(rng, n_zeros=4, still_frames=still, n_still=6)
    assert out.shape == (10, 30, 126)
    assert sum(not s.any() for s in out) == 4
    moving = out[4:]
    # Mano quieta: todos los frames de una secuencia son casi iguales.
    assert np.abs(moving - moving[:, :1]).max() < 0.1


def test_codes_are_unique_and_not_neutral():
    codes = list(SIGN_TO_CODE.values())
    assert len(codes) == len(set(codes)) and NEUTRAL not in codes
