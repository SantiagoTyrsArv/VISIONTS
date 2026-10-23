"""Normalización de manos idéntica a desktop/.../recognition/landmarks.ts."""

import numpy as np

SCALE_EPSILON = 1e-6
MIDDLE_MCP = 9
VALUES_PER_HAND = 63


def normalize_hand(points: np.ndarray | None) -> np.ndarray | None:
    """(21, 3) → (63,): trasladada a la muñeca y dividida por muñeca–nudillo medio."""
    if points is None or points.shape != (21, 3) or not np.isfinite(points).all():
        return None
    wrist = points[0]
    scale = float(np.linalg.norm(points[MIDDLE_MCP] - wrist))
    if scale < SCALE_EPSILON:
        return None
    return ((points - wrist) / scale).reshape(-1)


def normalize_frame(left: np.ndarray | None, right: np.ndarray | None) -> np.ndarray:
    """126 valores: izquierda y derecha; ceros para una mano ausente o degenerada."""
    out = np.zeros(2 * VALUES_PER_HAND, np.float32)
    for i, hand in enumerate((left, right)):
        norm = normalize_hand(hand)
        if norm is not None:
            out[i * VALUES_PER_HAND : (i + 1) * VALUES_PER_HAND] = norm
    return out


def assign_slots(
    hands: list[tuple[np.ndarray, str | None]],
) -> tuple[np.ndarray | None, np.ndarray | None]:
    """Misma regla que `assignHandSlots`: Left → 0, Right → 1; sin etiqueta o repetida, la
    primera libre. `hands` son pares (puntos (n, 3), handedness); si n ≠ 21 se descarta."""
    slots: list[np.ndarray | None] = [None, None]
    taken = [False, False]
    for points, handedness in hands:
        if len(points) != 21:
            continue
        side = {"Left": 0, "Right": 1}.get(handedness)
        if side is None or taken[side]:
            if all(taken):
                break
            side = taken.index(False)
        taken[side] = True
        slots[side] = points
    return slots[0], slots[1]
