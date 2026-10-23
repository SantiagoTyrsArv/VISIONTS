"""Secuencias de la clase neutral: sin manos y manos quietas."""

import numpy as np

SEQUENCE_LENGTH = 30


def make_neutral(
    rng: np.random.Generator, n_zeros: int, still_frames: np.ndarray, n_still: int
) -> np.ndarray:
    """`still_frames`: frames reales (126,) de los que se forman secuencias quietas con ruido."""
    zeros = np.zeros((n_zeros, SEQUENCE_LENGTH, 126), np.float32)
    picks = still_frames[rng.integers(0, len(still_frames), n_still)]
    still = np.repeat(picks[:, None, :], SEQUENCE_LENGTH, axis=1)
    still += rng.normal(0, 0.01, still.shape).astype(np.float32) * (still != 0)
    return np.concatenate([zeros, still.astype(np.float32)])
