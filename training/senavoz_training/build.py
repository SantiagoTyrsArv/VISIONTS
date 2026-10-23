"""Genera el modelo global de SeñaVoz a partir de LSC-54.

Uso (desde training/):
  python -m senavoz_training.build --data data/lsc54/cache [--dry-run]
"""

import argparse
import json
import math
import os
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch

from senavoz_training.labels import NEUTRAL, SIGN_TO_CODE
from senavoz_training.lsc54 import Sample, load_lsc54, load_shifted
from senavoz_training.neutral import make_neutral
from senavoz_training.train import train_model

OUT = Path(__file__).resolve().parents[2] / "desktop/src/renderer/src/assets/sign-model.json"
SOURCE = (
    "LSC-54 (Mora-Zarate, Garzón-Castro y Castellanos-Rivillas, Data in Brief 63, 112145, "
    "2025; DOI 10.57760/sciencedb.25639), CC BY-NC 4.0"
)
# El límite de train_model (300 s) es para el entrenamiento en el servidor; aquí es offline.
TIME_BUDGET_S = 7200.0
FOLDS = 6
SEEDS = (0, 1)
MAX_ROUNDS = 3
# Ventanas extra desplazadas ±4 y ±8 frames (cada frame = 66 ms) y weight decay: en la validación
# cruzada suben el acierto de casi todas las señas (FINDINGS.md, "Precisión").
SHIFTS = (-8, -4, 4, 8)
TRAIN_KW = {"weight_decay": 1e-3}


def round_sig(v: float, digits: int = 6) -> float:
    return 0.0 if v == 0 else round(v, digits - 1 - int(math.floor(math.log10(abs(v)))))


def _round(obj):
    if isinstance(obj, float):
        return round_sig(obj)
    if isinstance(obj, list):
        return [_round(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    return obj


@dataclass
class CrossValidation:
    per_label: dict[str, float]  # acierto agregado de todos los grupos, media de las semillas
    counts: dict[str, int]  # muestras validadas por etiqueta (cada persona, una vez)
    best_epochs: list[int]

    @property
    def accuracy(self) -> float:
        total = sum(self.counts.values())
        return sum(self.per_label[l] * n for l, n in self.counts.items()) / total


def _fold(job):
    samples, extra, test, stop, seed, kw = job
    torch.set_num_threads(2)
    return train_model(samples, extra=extra, val_signers=stop, test_signers=test, seed=seed,
                       **kw).metrics


def cross_validate(samples: list[Sample], *, extra: Sequence[Sample] = (), folds: int = FOLDS,
                   seeds: Sequence[int] = SEEDS, workers: int = 1, **kw) -> CrossValidation:
    """Validación cruzada por persona: las personas que hacen alguna seña se reparten en `folds`
    grupos y cada grupo se valida con un modelo que no lo vio. Una división única deja ~9 muestras
    por seña y da resultados muy distintos según quién cae en validación (FINDINGS.md).
    La parada temprana de cada modelo usa el grupo siguiente, nunca el que se mide: elegir la
    época con las personas medidas inflaría el acierto justo en el umbral del 80 %."""
    signers = sorted({s for s, l, _ in samples if l != NEUTRAL})
    order = np.random.default_rng(0).permutation(signers).tolist()
    groups = [set(order[i::folds]) for i in range(folds)]
    jobs = [(samples, extra, g, groups[(i + 1) % folds], seed, kw)
            for seed in seeds for i, g in enumerate(groups)]
    if workers > 1:
        with ProcessPoolExecutor(workers) as ex:
            results = list(ex.map(_fold, jobs))
    else:
        results = [_fold(j) for j in jobs]
    labels = sorted({l for _, l, _ in samples})
    validated = set(signers)
    counts = {l: sum(1 for s, ll, _ in samples if ll == l and s in validated) for l in labels}
    hits = dict.fromkeys(labels, 0.0)
    for (_, _, group, _, _, _), m in zip(jobs, results):
        for l in labels:
            n = sum(1 for s, ll, _ in samples if ll == l and s in group)
            hits[l] += m["per_label"].get(l, 0.0) * n  # sin muestras de entreno: 0 aciertos
    per_label = {l: round(hits[l] / (counts[l] * len(seeds)), 4) for l in labels if counts[l]}
    return CrossValidation(per_label, {l: counts[l] for l in per_label},
                           [m["best_epoch"] for m in results])


def build_model(samples: list[Sample], *, extra: Sequence[Sample] = (), min_accuracy: float = 0.8,
                folds: int = FOLDS, seeds: Sequence[int] = SEEDS, workers: int = 1, **kw):
    """Elige las señas con validación cruzada, pasa a neutral las de < min_accuracy y repite la
    validación con las que quedan. El modelo final se entrena con todas las personas."""
    kw.setdefault("time_budget_s", TIME_BUDGET_S)
    current, current_extra = samples, list(extra)
    for _ in range(MAX_ROUNDS):
        if len({l for _, l, _ in current} - {NEUTRAL}) < 2:
            return None  # quedan menos de 2 señas: no hay modelo útil
        cv = cross_validate(current, extra=current_extra, folds=folds, seeds=seeds,
                            workers=workers, **kw)
        weak = {l for l, acc in cv.per_label.items() if l != NEUTRAL and acc < min_accuracy}
        if not weak:
            break
        relabel = lambda part: [(s, NEUTRAL if l in weak else l, x) for s, l, x in part]  # noqa: E731
        current, current_extra = relabel(current), relabel(current_extra)
    if weak or len(set(cv.per_label) - {NEUTRAL}) < 2:
        return None
    final_kw = {**kw, "max_epochs": max(1, int(np.median(cv.best_epochs)))}
    result = train_model(current, extra=current_extra, val_signers=set(), seed=seeds[0], **final_kw)
    return _round({
        **result.weights,
        "metrics": {"val_accuracy": cv.accuracy, "per_label": cv.per_label},
        "source": SOURCE,
    })


def _to_codes(raw: list[Sample]) -> list[Sample]:
    return [(s, SIGN_TO_CODE.get(n, NEUTRAL), x) for s, n, x in raw]


def dataset_extra(root: Path) -> list[Sample]:
    """Ventanas desplazadas, solo para entrenar."""
    return _to_codes(load_shifted(root, SHIFTS))


def dataset_samples(root: Path, seed: int = 0) -> list[Sample]:
    raw = load_lsc54(root)
    rng = np.random.default_rng(seed)
    kept = [(s, SIGN_TO_CODE[n], x) for s, n, x in raw if n in SIGN_TO_CODE]
    others = [(s, NEUTRAL, x) for s, n, x in raw if n not in SIGN_TO_CODE]
    signers = sorted({s for s, _, _ in raw})
    per_signer = max(1, len(kept) // max(1, len(SIGN_TO_CODE)) // len(signers))
    still_src = np.concatenate([x for _, _, x in kept])
    still_src = still_src[still_src.any(axis=1)]
    synth = []
    for s in signers:
        for seq in make_neutral(rng, per_signer, still_src, per_signer):
            synth.append((s, NEUTRAL, seq))
    return kept + others + synth


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--dry-run", action="store_true", help="solo imprime métricas")
    args = p.parse_args()
    workers = max(1, min(FOLDS, (os.cpu_count() or 2) // 2))
    model = build_model(dataset_samples(args.data), extra=dataset_extra(args.data),
                        workers=workers, **TRAIN_KW)
    if model is None:
        print("Menos de 2 señas superan el umbral: no se escribe el modelo.")
        raise SystemExit(1)
    print(json.dumps(model["metrics"], indent=1, ensure_ascii=False))
    if not args.dry_run:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
        print(f"Modelo escrito en {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
