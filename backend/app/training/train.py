import copy
import math
import time
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import torch
from torch import nn

from app.training.model import SignGRU, export_weights

VAL_FRACTION = 0.2
MAX_SHIFT = 3


class TrainingTimeout(Exception):
    pass


@dataclass
class TrainResult:
    weights: dict
    metrics: dict


def _split(samples: dict[str, np.ndarray], labels: list[str], rng: np.random.Generator):
    """División estratificada: un 20 % de cada etiqueta (mínimo una muestra) a validación."""
    xs_tr, ys_tr, xs_va, ys_va = [], [], [], []
    for k, label in enumerate(labels):
        arr = samples[label]
        perm = rng.permutation(len(arr))
        n_val = max(1, round(len(arr) * VAL_FRACTION))
        xs_va.append(arr[perm[:n_val]])
        xs_tr.append(arr[perm[n_val:]])
        ys_va.append(np.full(n_val, k, np.int64))
        ys_tr.append(np.full(len(arr) - n_val, k, np.int64))
    return (
        np.concatenate(xs_tr).astype(np.float32),
        np.concatenate(ys_tr),
        np.concatenate(xs_va).astype(np.float32),
        np.concatenate(ys_va),
    )


def augment(batch: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Escala 0,9–1,1, ruido σ=0,01 (sin tocar manos ausentes) y desplazamiento de ±3 frames."""
    out = batch.copy()
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


def train_model(
    samples: dict[str, np.ndarray],
    *,
    hidden_size: int = 64,
    max_epochs: int = 150,
    patience: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    seed: int = 0,
    time_budget_s: float = 300.0,
    clock: Callable[[], float] = time.monotonic,
) -> TrainResult:
    labels = sorted(samples)
    if len(labels) < 2:
        raise ValueError("Se necesitan al menos dos etiquetas para entrenar")
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)
    x_tr, y_tr, x_va, y_va = _split(samples, labels, rng)
    xv, yv = torch.from_numpy(x_va), torch.from_numpy(y_va)

    model = SignGRU(len(labels), hidden_size=hidden_size)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.CrossEntropyLoss()
    start = clock()
    best_loss, best_state, stale = math.inf, copy.deepcopy(model.state_dict()), 0

    for _ in range(max_epochs):
        model.train()
        order = rng.permutation(len(x_tr))
        for i in range(0, len(order), batch_size):
            idx = order[i : i + batch_size]
            xb = torch.from_numpy(augment(x_tr[idx], rng))
            yb = torch.from_numpy(y_tr[idx])
            optimizer.zero_grad()
            loss_fn(model(xb), yb).backward()
            optimizer.step()
            if clock() - start > time_budget_s:
                raise TrainingTimeout("El entrenamiento superó el tiempo máximo")
        model.eval()
        with torch.no_grad():
            val_loss = loss_fn(model(xv), yv).item()
        if val_loss < best_loss - 1e-6:
            best_loss, best_state, stale = val_loss, copy.deepcopy(model.state_dict()), 0
        else:
            stale += 1
            if stale >= patience:
                break

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        pred = model(xv).argmax(dim=1).numpy()
    per_label = {
        label: round(float((pred[y_va == k] == k).mean()), 4) for k, label in enumerate(labels)
    }
    metrics = {
        "val_accuracy": round(float((pred == y_va).mean()), 4),
        "per_label": per_label,
        "samples": {label: int(len(samples[label])) for label in labels},
    }
    return TrainResult(weights=export_weights(model, labels), metrics=metrics)
