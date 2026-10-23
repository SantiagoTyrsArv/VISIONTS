"""Genera el fixture que comprueba que la app y el entrenamiento normalizan igual.

La fórmula de referencia está escrita aquí a propósito, separada de las dos implementaciones.
Uso (desde la raíz): python -I training/scripts/make_landmarks_fixture.py
"""

import json
import math
from pathlib import Path

OUT = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json"
)


def hand(wx, wy, wz, spread):
    return [
        {"x": wx + i * 0.01 * spread, "y": wy - i * 0.02 * spread, "z": wz + i * 0.001}
        for i in range(21)
    ]


def reference(points):
    w, m = points[0], points[9]
    scale = math.dist((w["x"], w["y"], w["z"]), (m["x"], m["y"], m["z"]))
    if scale < 1e-6:
        return None
    return [
        v
        for p in points
        for v in ((p["x"] - w["x"]) / scale, (p["y"] - w["y"]) / scale, (p["z"] - w["z"]) / scale)
    ]


def frame(hands):
    # Las manos con un número de puntos distinto de 21 se descartan antes de asignarlas.
    # Una mano degenerada (reference() None) sí ocupa su posición; queda en ceros.
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
        slots[side] = reference(h["landmarks"])
    return [v for s in slots for v in (s if s is not None else [0.0] * 63)]


CASES = {
    "dos manos": [
        {"landmarks": hand(0.3, 0.6, 0.0, 1.0), "handedness": "Left"},
        {"landmarks": hand(0.7, 0.6, 0.0, 2.0), "handedness": "Right"},
    ],
    "solo derecha": [{"landmarks": hand(0.6, 0.5, 0.0, 1.5), "handedness": "Right"}],
    "solo izquierda": [{"landmarks": hand(0.4, 0.5, 0.0, 0.5), "handedness": "Left"}],
    "derecha antes que izquierda": [
        {"landmarks": hand(0.7, 0.6, 0.0, 2.0), "handedness": "Right"},
        {"landmarks": hand(0.3, 0.6, 0.0, 1.0), "handedness": "Left"},
    ],
    "sin handedness": [{"landmarks": hand(0.5, 0.5, 0.0, 1.0)}],
    "mano degenerada": [
        {"landmarks": [{"x": 0.5, "y": 0.5, "z": 0.0}] * 21, "handedness": "Left"}
    ],
    "sin manos": [],
}

OUT.write_text(
    json.dumps(
        {"cases": [{"name": n, "hands": h, "expected": frame(h)} for n, h in CASES.items()]},
        indent=1,
    ),
    encoding="utf-8",
)
print(f"Fixture escrito en {OUT}")
