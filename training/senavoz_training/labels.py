"""Señas de LSC-54 que entran en el catálogo de SeñaVoz, con el `code` de su frase."""

NEUTRAL = "neutral"

# Nombre en el dataset (clave exacta, ver FINDINGS.md) → code de la frase
# (backend/app/services/phrase_service.py). Solo se exportan las que pasan el 80 %.
SIGN_TO_CODE: dict[str, str] = {
    # 18 personas
    "Hola": "hello",
    "Chao": "bye",
    "Buenos dias": "good_morning",
    "Buenas tardes": "good_afternoon",
    "Buenas Noches": "good_evening",
    "Bien": "good",
    "Mal": "bad",
    "Ayudar": "help",
    "Perdon": "sorry",
    "Por favor": "please",
    "Denada": "welcome",
    # 9 personas, con frase ya existente
    "Si": "yes",
    "No": "no",
    "Gracias": "thanks",
}
