"""Seed idempotente de frases por defecto. Uso: python -m scripts.seed"""

from app.db.session import SessionLocal
from app.services.phrase_service import seed_default_phrases


def main() -> None:
    with SessionLocal() as db:
        created = seed_default_phrases(db)
    print(f"Seed de frases: {created} nuevas")


if __name__ == "__main__":
    main()
