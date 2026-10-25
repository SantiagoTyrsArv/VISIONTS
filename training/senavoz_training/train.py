import copy
import math
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass

import numpy as np
import torch
from torch import nn

from senavoz_training.model import SignGRU, export_weights


class TrainingTimeout(Exception):
    """El entrenamiento superó el tiempo máximo."""


__all__ = ["Sample", "TrainResult", "TrainingTimeout", "augment", "mirror", "time_warp", "train_model"]

VAL_SIGNER_FRACTION = 0.2
MAX_SHIFT = 6
MAX_WARP = 0.2

Sample = tuple[str, str, np.ndarray]


@dataclass
class TrainResult:
    weights: dict
    metrics: dict


def _split(samples: list[Sample], extra, labels: list[str], val_signers: set[str]):
    """Validación con personas no vistas: todas las muestras de `val_signers` van a validación.
    `extra` solo entrena: las de personas de validación se descartan."""
    index = {label: k for k, label in enumerate(labels)}
    tr = [(x, index[l]) for s, l, x in [*samples, *extra] if s not in val_signers]
    va = [(x, index[l]) for s, l, x in samples if s in val_signers]
    stack = lambda part: (  # noqa: E731
        np.stack([x for x, _ in part]).astype(np.float32)
        if part else np.zeros((0, 30, 126), np.float32),
        np.array([y for _, y in part], np.int64),
    )
    return (*stack(tr), *stack(va))


def mirror(batch: np.ndarray) -> np.ndarray:
    """Intercambia las manos y niega x: la misma seña hecha con la otra mano."""
    out = np.concatenate([batch[..., 63:], batch[..., :63]], axis=-1).copy()
    out[..., 0::3] *= -1
    return out


def time_warp(batch: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Cambia la velocidad de cada secuencia ±20 %: más lenta repite frames, más rápida
    termina antes y mantiene el último frame (como una ventana que sigue tras la seña)."""
    out = np.empty_like(batch)
    n = batch.shape[1]
    for i in range(len(batch)):
        f = rng.uniform(1 - MAX_WARP, 1 + MAX_WARP)
        src = np.clip(np.round(np.arange(n) * f), 0, n - 1).astype(int)
        out[i] = batch[i, src]
    return out


def augment(batch: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Espejo (50 %), time-warp ±20 %, escala 0,9–1,1, ruido σ=0,01 (sin tocar manos
    ausentes) y desplazamiento de ±6 frames."""
    out = batch.copy()
    flip = rng.random(len(out)) < 0.5
    out[flip] = mirror(out[flip])
    out = time_warp(out, rng)
    present = out != 0
    out *= rng.uniform(0.9, 1.1, size=(len(out), 1, 1)).astype(np.float32)
    out += rng.normal(0, 0.01, size=out.shape).astype(np.float32) * present
    for i in range(len(out)):
        s = int(rng.integers(-MAX_SHIFT, MAX_SHIFT + 1))
        if s > 0:
            out[i] = np.concatenate([np.repeat(out[i][:1], s, 0), out[i][:-s]])
        elif s < 0:
            out[i] = np.concatenate([out[i][-s:], np.repeat(out[i][-1:], -s, 0)])
    return out


def _train_epoch(
    model: nn.Module,
    optimizer: torch.optim.Optimizer,
    loss_fn: nn.Module,
    x_tr: np.ndarray,
    y_tr: np.ndarray,
    rng: np.random.Generator,
    batch_size: int,
    out_of_time: Callable[[], bool],
) -> None:
    """Una pasada por el entrenamiento en lotes aumentados y barajados."""
    model.train()
    order = rng.permutation(len(x_tr))
    for i in range(0, len(order), batch_size):
        idx = order[i : i + batch_size]
        xb = torch.from_numpy(augment(x_tr[idx], rng))
        yb = torch.from_numpy(y_tr[idx])
        optimizer.zero_grad()
        loss_fn(model(xb), yb).backward()
        optimizer.step()
        if out_of_time():
            raise TrainingTimeout("El entrenamiento superó el tiempo máximo")


def _accuracy(
    model: nn.Module, labels: list[str], x_ev: np.ndarray, y_ev: np.ndarray
) -> tuple[float | None, dict[str, float]]:
    """Acierto global (None sin muestras de evaluación) y por seña."""
    measured = len(x_ev) > 0
    with torch.no_grad():
        pred = model(torch.from_numpy(x_ev)).argmax(dim=1).numpy() if measured else y_ev
    # Una seña sin personas en validación no tiene acierto medible: no se incluye.
    per_label = {
        label: round(float((pred[y_ev == k] == k).mean()), 4)
        for k, label in enumerate(labels)
        if (y_ev == k).any()
    }
    return (round(float((pred == y_ev).mean()), 4) if measured else None), per_label


def train_model(
    samples: list[Sample],
    *,
    extra: Sequence[Sample] = (),
    val_signers: set[str] | None = None,
    hidden_size: int = 64,
    max_epochs: int = 150,
    patience: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    weight_decay: float = 0.0,
    seed: int = 0,
    time_budget_s: float = 300.0,
    clock: Callable[[], float] = time.monotonic,
    test_signers: set[str] = frozenset(),
) -> TrainResult:
    """Con `test_signers`, sus muestras no entrenan ni deciden la parada temprana (eso lo hacen
    `val_signers`) y el acierto se mide solo con ellas: medir con las mismas personas que eligen
    la época daría un acierto optimista."""
    labels = sorted({label for _, label, _ in samples})
    if len(labels) < 2:
        raise ValueError("Se necesitan al menos dos etiquetas para entrenar")
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)
    held_out = [x for x in samples if x[0] in test_signers]
    samples = [x for x in samples if x[0] not in test_signers]
    extra = [x for x in extra if x[0] not in test_signers]
    signers = sorted({s for s, _, _ in samples})
    if val_signers is None:
        n_val = max(1, round(len(signers) * VAL_SIGNER_FRACTION))
        val_signers = set(rng.permutation(signers)[:n_val].tolist())
    x_tr, y_tr, x_va, y_va = _split(samples, extra, labels, val_signers)
    xv, yv = torch.from_numpy(x_va), torch.from_numpy(y_va)
    validate = len(x_va) > 0  # sin validación: se entrenan todas las épocas

    model = SignGRU(len(labels), hidden_size=hidden_size)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    loss_fn = nn.CrossEntropyLoss()
    start = clock()
    best_loss, best_state, stale = math.inf, copy.deepcopy(model.state_dict()), 0
    best_epoch = 0

    def out_of_time() -> bool:
        return clock() - start > time_budget_s

    for epoch in range(1, max_epochs + 1):
        _train_epoch(model, optimizer, loss_fn, x_tr, y_tr, rng, batch_size, out_of_time)
        if not validate:
            best_state, best_epoch = model.state_dict(), epoch
            continue
        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(xv), yv).item()
        if val_loss < best_loss - 1e-6:
            best_loss, best_state, stale = val_loss, copy.deepcopy(model.state_dict()), 0
            best_epoch = epoch
        else:
            stale += 1
            if stale >= patience:
                break

    model.load_state_dict(best_state)
    model.eval()
    if test_signers:
        _, _, x_ev, y_ev = _split(held_out, (), labels, set(test_signers))
    else:
        x_ev, y_ev = x_va, y_va
    val_accuracy, per_label = _accuracy(model, labels, x_ev, y_ev)
    metrics = {
        "val_accuracy": val_accuracy,
        "per_label": per_label,
        "samples": {
            label: sum(1 for _, l, _ in [*samples, *held_out] if l == label) for label in labels
        },
        "val_signers": sorted(val_signers),
        "test_signers": sorted(test_signers),
        "train_size": len(x_tr),
        "eval_size": len(x_ev),
        "best_epoch": best_epoch,
    }
    return TrainResult(weights=export_weights(model, labels), metrics=metrics)
