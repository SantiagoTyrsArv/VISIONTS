"""LSC-54 (Mora-Zarate et al., 2025; CC BY-NC 4.0): caché de extract.py → ventanas 30×126."""

from pathlib import Path

import numpy as np

SEQUENCE_LENGTH = 30

Sample = tuple[str, str, np.ndarray]


def _center_start(with_hands: np.ndarray, n: int) -> int:
    center = (with_hands[0] + with_hands[-1]) / 2
    return int(np.clip(round(center - SEQUENCE_LENGTH / 2), 0, n - SEQUENCE_LENGTH))


def window(seq: np.ndarray) -> np.ndarray | None:
    """Una ventana de 30 frames centrada en el tramo con manos; None si no hay manos.

    Un vídeo más corto se rellena con frames sin manos antes y después, como verá la app
    cuando la persona baja las manos."""
    with_hands = np.flatnonzero(seq.any(axis=1))
    if not len(with_hands):
        return None
    n = len(seq)
    if n < SEQUENCE_LENGTH:
        before = (SEQUENCE_LENGTH - n) // 2
        out = np.zeros((SEQUENCE_LENGTH, seq.shape[1]), np.float32)
        out[before : before + n] = seq
        return out
    start = _center_start(with_hands, n)
    return seq[start : start + SEQUENCE_LENGTH].astype(np.float32)


def _videos(root: Path):
    for path in sorted(Path(root).rglob("*.npy")):
        if not path.name.endswith(".tmp.npy"):
            yield path


def shifted_windows(seq: np.ndarray, offsets) -> list[np.ndarray]:
    """Ventanas desplazadas `offsets` frames respecto a la central, como las que ve la app al
    deslizar sobre la seña. Sin repetir la central ni ventanas sin manos."""
    with_hands = np.flatnonzero(seq.any(axis=1))
    n = len(seq)
    if not len(with_hands) or n <= SEQUENCE_LENGTH:
        return []
    center = _center_start(with_hands, n)
    seen, out = {center}, []
    for offset in offsets:
        start = int(np.clip(center + offset, 0, n - SEQUENCE_LENGTH))
        win = seq[start : start + SEQUENCE_LENGTH]
        if start not in seen and win.any():
            seen.add(start)
            out.append(win.astype(np.float32))
    return out


def load_shifted(root: Path, offsets) -> list[Sample]:
    """Muestras extra para entrenar: las ventanas desplazadas de cada vídeo."""
    return [
        (path.stem.split("__")[0], path.parent.name, win)
        for path in _videos(root)
        for win in shifted_windows(np.load(path), offsets)
    ]


def load_lsc54(root: Path) -> list[Sample]:
    """Una muestra (persona, seña, ventana) por vídeo de <root>/<tema>/<seña>/<persona>__<n>.npy."""
    samples: list[Sample] = []
    for path in _videos(root):
        seq = window(np.load(path))
        if seq is not None:
            samples.append((path.stem.split("__")[0], path.parent.name, seq))
    return samples
