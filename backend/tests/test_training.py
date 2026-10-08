import numpy as np
import pytest

from app.training.model import WEIGHTS_FORMAT
from app.training.train import TrainingTimeout, train_model


def _synthetic(seed=0, n=20):
    """Tres clases separables: mano izquierda arriba, abajo y reposo (ceros)."""
    rng = np.random.default_rng(seed)
    up = np.zeros((n, 30, 126), np.float32)
    up[:, :, :63] = 0.4
    down = np.zeros((n, 30, 126), np.float32)
    down[:, :, :63] = -0.4
    up += rng.normal(0, 0.02, up.shape).astype(np.float32)
    down += rng.normal(0, 0.02, down.shape).astype(np.float32)
    return {"yes": up, "no": down, "neutral": np.zeros((n, 30, 126), np.float32)}


def test_trains_separable_data():
    result = train_model(_synthetic(), hidden_size=16, max_epochs=40)
    assert result.metrics["val_accuracy"] >= 0.9
    assert set(result.metrics["per_label"]) == {"neutral", "no", "yes"}
    assert result.metrics["samples"] == {"neutral": 20, "no": 20, "yes": 20}


def test_weights_format_and_shapes():
    w = train_model(_synthetic(), hidden_size=16, max_epochs=2).weights
    assert w["format"] == WEIGHTS_FORMAT
    assert w["labels"] == ["neutral", "no", "yes"]
    assert (w["input_size"], w["hidden_size"]) == (126, 16)
    assert np.array(w["gru"]["weight_ih"]).shape == (48, 126)
    assert np.array(w["gru"]["weight_hh"]).shape == (48, 16)
    assert np.array(w["gru"]["bias_ih"]).shape == (48,)
    assert np.array(w["gru"]["bias_hh"]).shape == (48,)
    assert np.array(w["head"]["weight"]).shape == (3, 16)
    assert np.array(w["head"]["bias"]).shape == (3,)


def test_same_seed_same_result():
    a = train_model(_synthetic(), hidden_size=8, max_epochs=3)
    b = train_model(_synthetic(), hidden_size=8, max_epochs=3)
    assert a.weights == b.weights


def test_time_budget():
    ticks = iter(range(0, 10_000, 100))
    with pytest.raises(TrainingTimeout):
        train_model(_synthetic(), hidden_size=8, time_budget_s=150, clock=lambda: next(ticks))


def test_needs_two_labels():
    with pytest.raises(ValueError):
        train_model({"neutral": np.zeros((20, 30, 126), np.float32)})
