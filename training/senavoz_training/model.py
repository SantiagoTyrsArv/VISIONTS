import torch
from torch import nn

WEIGHTS_FORMAT = "senavoz-gru-v1"
INPUT_SIZE = 126


class SignGRU(nn.Module):
    """GRU de una capa sobre la secuencia; clasifica con el último estado oculto."""

    def __init__(self, n_labels: int, input_size: int = INPUT_SIZE, hidden_size: int = 64):
        super().__init__()
        self.gru = nn.GRU(input_size, hidden_size, batch_first=True)
        self.head = nn.Linear(hidden_size, n_labels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        _, h = self.gru(x)  # h: (1, lote, hidden)
        return self.head(h[-1])


def _tolist(t: torch.Tensor) -> list:
    return t.detach().cpu().numpy().tolist()


def export_weights(model: SignGRU, labels: list[str]) -> dict:
    """Pesos en JSON con la convención de PyTorch (puertas r, z, n); la app los ejecuta en TS."""
    g = model.gru
    return {
        "format": WEIGHTS_FORMAT,
        "input_size": g.input_size,
        "hidden_size": g.hidden_size,
        "labels": list(labels),
        "gru": {
            "weight_ih": _tolist(g.weight_ih_l0),
            "weight_hh": _tolist(g.weight_hh_l0),
            "bias_ih": _tolist(g.bias_ih_l0),
            "bias_hh": _tolist(g.bias_hh_l0),
        },
        "head": {"weight": _tolist(model.head.weight), "bias": _tolist(model.head.bias)},
    }
