import numpy as np

from senavoz_training.build import SOURCE, build_model, cross_validate, round_sig

FAST = {"hidden_size": 16, "max_epochs": 40, "folds": 3, "seeds": (0,)}


def _samples():
    rng = np.random.default_rng(0)
    out = []
    for s in [f"S{i}" for i in range(10)]:
        for _ in range(4):
            up = np.zeros((30, 126), np.float32)
            up[:, :63] = 0.4
            out.append((s, "hello", up + rng.normal(0, 0.02, up.shape).astype(np.float32)))
            down = np.zeros((30, 126), np.float32)
            down[:, :63] = -0.4
            out.append((s, "bye", down + rng.normal(0, 0.02, down.shape).astype(np.float32)))

            out.append((s, "neutral", np.zeros((30, 126), np.float32)))
    for s in [f"S{i}" for i in range(10)]:
        for k in range(4):
            # Mitad igual que hello y mitad igual que bye: el modelo no la puede distinguir.
            x = np.zeros((30, 126), np.float32)
            x[:, :63] = 0.4 if k % 2 else -0.4
            out.append((s, "sorry", x + rng.normal(0, 0.02, x.shape).astype(np.float32)))
    return out


def test_cross_validation_measures_every_sign_with_every_signer():
    cv = cross_validate(_samples(), **FAST)
    assert set(cv.per_label) == {"hello", "bye", "sorry", "neutral"}
    assert cv.per_label["hello"] >= 0.8
    assert cv.per_label["bye"] >= 0.8
    assert cv.per_label["sorry"] < 0.8
    assert cv.counts["hello"] == 40  # 10 personas × 4: todas validadas una vez
    assert len(cv.best_epochs) == 3


def test_keeps_only_signs_above_threshold():
    model = build_model(_samples(), **FAST)
    assert model is not None
    assert "sorry" not in model["labels"]
    assert {"hello", "bye", "neutral"} <= set(model["labels"])
    assert model["source"] == SOURCE
    assert all(v >= 0.8 for k, v in model["metrics"]["per_label"].items() if k != "neutral")
    assert 0 < model["metrics"]["val_accuracy"] <= 1


def test_none_when_fewer_than_two_signs_pass():
    rng = np.random.default_rng(1)
    noisy = [(f"S{i}", lbl, rng.normal(0, 1, (30, 126)).astype(np.float32))
             for i in range(10) for lbl in ("hello", "bye", "neutral") for _ in range(3)]
    assert build_model(noisy, hidden_size=8, max_epochs=3, folds=3, seeds=(0,)) is None


def test_round_sig():
    assert round_sig(0.123456789) == 0.123457
    assert round_sig(-1234567.0) == -1234570.0
    assert round_sig(0.0) == 0.0


def test_sign_done_by_a_single_signer_is_not_exported():
    # Sin otras personas que la hagan, no se puede validar con personas no vistas.
    extra = [("S9", "thanks", np.full((30, 126), 0.2, np.float32)) for _ in range(4)]
    model = build_model(_samples() + extra, **FAST)
    assert model is not None
    assert "thanks" not in model["labels"]


def test_early_stopping_never_uses_the_measured_signers(monkeypatch):
    import senavoz_training.build as build

    calls = []
    real = build.train_model

    def spy(samples, **kw):
        calls.append((kw["val_signers"], kw["test_signers"]))
        return real(samples, **kw)

    monkeypatch.setattr(build, "train_model", spy)
    cross_validate(_samples(), **FAST)
    assert all(val and test and not val & test for val, test in calls)
    assert set().union(*(test for _, test in calls)) == {f"S{i}" for i in range(10)}
