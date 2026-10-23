import numpy as np
import pytest

from senavoz_training.model import WEIGHTS_FORMAT
from senavoz_training.train import TrainingTimeout, train_model


SIGNERS = [f"S{i}" for i in range(10)]


def _synthetic(seed=0, per_signer=4):
    """Tres clases separables (arriba, abajo, ceros) grabadas por 10 personas."""
    rng = np.random.default_rng(seed)
    out = []
    for s in SIGNERS:
        for _ in range(per_signer):
            up = np.zeros((30, 126), np.float32)
            up[:, :63] = 0.4
            down = np.zeros((30, 126), np.float32)
            down[:, :63] = -0.4
            out.append((s, "yes", up + rng.normal(0, 0.02, up.shape).astype(np.float32)))
            out.append((s, "no", down + rng.normal(0, 0.02, down.shape).astype(np.float32)))
            out.append((s, "neutral", np.zeros((30, 126), np.float32)))
    return out


def test_trains_separable_data():
    result = train_model(_synthetic(), hidden_size=16, max_epochs=40)
    assert result.metrics["val_accuracy"] >= 0.9
    assert set(result.metrics["per_label"]) == {"neutral", "no", "yes"}
    assert result.metrics["samples"] == {"neutral": 40, "no": 40, "yes": 40}


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
        train_model([("S0", "neutral", np.zeros((30, 126), np.float32))])


def test_validation_uses_unseen_signers():
    result = train_model(_synthetic(), hidden_size=8, max_epochs=2, val_signers={"S0", "S1"})
    assert set(result.metrics["val_signers"]) == {"S0", "S1"}


def test_default_split_holds_out_about_20_percent_of_signers():
    result = train_model(_synthetic(), hidden_size=8, max_epochs=2)
    assert len(result.metrics["val_signers"]) == 2


def test_mirror_swaps_hands_and_negates_x():
    from senavoz_training.train import mirror

    x = np.zeros((1, 30, 126), np.float32)
    x[0, :, 0] = 0.5   # x del primer punto de la mano izquierda
    x[0, :, 1] = 0.25  # y
    m = mirror(x)
    assert m[0, 0, 63] == -0.5 and m[0, 0, 64] == 0.25 and not m[0, :, :63].any()


def test_time_warp_keeps_shape():
    from senavoz_training.train import time_warp

    rng = np.random.default_rng(0)
    x = np.arange(30 * 126, dtype=np.float32).reshape(1, 30, 126)
    assert time_warp(x, rng).shape == (1, 30, 126)


def test_label_without_validation_signers_is_left_out_of_per_label():
    samples = _synthetic() + [("S5", "rare", np.full((30, 126), 0.1, np.float32))] * 4
    result = train_model(samples, hidden_size=8, max_epochs=2, val_signers={"S0", "S1"})
    assert "rare" not in result.metrics["per_label"]
    assert all(v == v for v in result.metrics["per_label"].values())  # sin NaN


def test_extra_samples_only_train_and_skip_validation_signers():
    extra = [(s, "yes", np.full((30, 126), 0.4, np.float32)) for s in ("S0", "S5")]
    result = train_model(_synthetic(), extra=extra, hidden_size=8, max_epochs=2,
                         val_signers={"S0", "S1"})
    # Validación: solo las muestras normales de S0 y S1 (3 etiquetas × 4 × 2 personas).
    assert sum(result.metrics["samples"].values()) == len(_synthetic())
    assert result.metrics["train_size"] == 8 * 4 * 3 + 1


def test_without_validation_trains_all_epochs():
    result = train_model(_synthetic(), hidden_size=8, max_epochs=3, val_signers=set())
    assert result.metrics["per_label"] == {}
    assert result.metrics["val_accuracy"] is None
    assert result.metrics["best_epoch"] == 3


def test_best_epoch_is_reported():
    result = train_model(_synthetic(), hidden_size=8, max_epochs=4, weight_decay=1e-3)
    assert 1 <= result.metrics["best_epoch"] <= 4


def test_test_signers_are_left_out_of_training_and_early_stopping():
    # La parada temprana elige época con val_signers; el acierto se mide con test_signers,
    # que el modelo no vio ni influyeron en esa elección.
    extra = [("S2", "yes", np.full((30, 126), 0.4, np.float32))]
    result = train_model(_synthetic(), extra=extra, hidden_size=8, max_epochs=2,
                         val_signers={"S0", "S1"}, test_signers={"S2"})
    assert result.metrics["test_signers"] == ["S2"]
    assert result.metrics["train_size"] == 7 * 4 * 3  # sin S0, S1 ni S2 (tampoco su extra)
    assert result.metrics["eval_size"] == 4 * 3  # solo S2
    assert set(result.metrics["per_label"]) == {"neutral", "no", "yes"}
