import ast
from pathlib import Path

from senavoz_training.labels import NEUTRAL, SIGN_TO_CODE

PHRASE_SERVICE = Path(__file__).resolve().parents[2] / "backend/app/services/phrase_service.py"


def _default_phrase_codes() -> set[str]:
    """`code` de DEFAULT_PHRASES, leídos sin importar el backend (otras dependencias)."""
    tree = ast.parse(PHRASE_SERVICE.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", None) == "DEFAULT_PHRASES":
            return {code for code, _ in ast.literal_eval(node.value)}
    raise AssertionError("DEFAULT_PHRASES no está en phrase_service.py")


def test_cada_sena_tiene_frase_en_el_catalogo():
    # La app ignora una seña reconocida cuyo code no está en el catálogo del backend.
    assert set(SIGN_TO_CODE.values()) <= _default_phrase_codes()


def test_neutral_no_es_una_frase():
    assert NEUTRAL not in SIGN_TO_CODE.values()
    assert NEUTRAL not in _default_phrase_codes()
