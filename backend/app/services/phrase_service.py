from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Phrase

DEFAULT_PHRASES: list[tuple[str, str]] = [
    ("yes", "Sí"),
    ("no", "No"),
    ("agree", "De acuerdo"),
    ("disagree", "En desacuerdo"),
    ("question", "Tengo una pregunta"),
    ("may_i_speak", "¿Puedo hablar?"),
    ("thanks", "Gracias"),
    ("repeat", "¿Puedes repetir, por favor?"),
    ("moment", "Necesito un momento"),
    # Frases con seña en el modelo global (training/senavoz_training/labels.py; un test de
    # training/ comprueba que cada seña tiene aquí su frase). Sin seña exportada, van por clic.
    ("hello", "Hola"),
    ("bye", "Hasta luego"),
    ("good_morning", "Buenos días"),
    ("good_afternoon", "Buenas tardes"),
    ("good_evening", "Buenas noches"),
    ("good", "Bien"),
    ("bad", "Mal"),
    ("help", "Necesito ayuda"),
    ("sorry", "Perdón"),
    ("please", "Por favor"),
    ("welcome", "De nada"),
]


def list_phrases(db: Session) -> list[Phrase]:
    # Orden estable: el de inserción del seed (created_at + code como desempate).
    return list(db.scalars(select(Phrase).order_by(Phrase.created_at, Phrase.code)))


def seed_default_phrases(db: Session) -> int:
    """Idempotente: inserta solo las frases cuyo `code` no existe. Devuelve cuántas creó."""
    existing = set(db.scalars(select(Phrase.code)))
    created = 0
    for code, text in DEFAULT_PHRASES:
        if code not in existing:
            db.add(Phrase(code=code, text_es=text, is_default=True))
            created += 1
    db.commit()
    return created
