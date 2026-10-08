"""Genera el fixture que comprueba que la GRU en TypeScript calcula igual que PyTorch.

Uso (desde backend/): python -m scripts.export_gru_fixture
"""

import json
from pathlib import Path

import numpy as np
import torch

from app.training.model import SignGRU, export_weights

OUT = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/src/services/recognition/__fixtures__/gru-parity.json"
)


def main() -> None:
    torch.manual_seed(0)
    labels = ["agree", "neutral", "thanks"]
    # hidden_size pequeño para que el fixture pese poco; la app admite cualquier tamaño.
    model = SignGRU(len(labels), hidden_size=8).eval()
    rng = np.random.default_rng(0)
    x = rng.uniform(-0.5, 0.5, size=(30, 126)).astype(np.float32)
    with torch.no_grad():
        probs = torch.softmax(model(torch.from_numpy(x)[None]), dim=1)[0].numpy()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "weights": export_weights(model, labels),
                "input": x.reshape(-1).tolist(),
                "probabilities": probs.tolist(),
            }
        ),
        encoding="utf-8",
    )
    print(f"Fixture escrito en {OUT}")


if __name__ == "__main__":
    main()
