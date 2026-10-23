# Entrenamiento del modelo de señas (offline)

SeñaVoz reconoce señas de la Lengua de Señas Colombiana con un único modelo, entrenado aquí
y empaquetado en la app (`desktop/src/renderer/src/assets/sign-model.json`). Nada de esta
carpeta se despliega.

## Datos

LSC-54: Mora-Zarate, Garzón-Castro y Castellanos-Rivillas, *LSC-54: A landmark-based
dataset for Colombian Sign Language*, Data in Brief 63 (2025) 112145.
Dataset: https://doi.org/10.57760/sciencedb.25639 — licencia **CC BY-NC 4.0** (uso no comercial,
con atribución). No se versiona.

No se usa el `datos.json` del dataset (51 GB, extraído con MediaPipe Holistic): se descargan solo los
vídeos crudos (`RawVideos/*.zip`, ~970 MB, enlaces en `FINDINGS.md`) en `training/data/lsc54/RawVideos/`
y se extraen los landmarks con el mismo Hand Landmarker que usa la app, para que entrenamiento y app
vean exactamente los mismos puntos:

    .venv\Scripts\python -m senavoz_training.extract --zips data/lsc54/RawVideos --cache data/lsc54/cache

La extracción guarda una caché `.npy` por vídeo y no repite los ya procesados.

## Entrenar

    cd training
    python -m venv .venv
    .venv\Scripts\pip install -r requirements.txt
    .venv\Scripts\python -m pytest
    .venv\Scripts\python -m senavoz_training.build --data data/lsc54/cache --dry-run   # solo métricas
    .venv\Scripts\python -m senavoz_training.build --data data/lsc54/cache       # escribe el modelo

Solo se exportan las señas con ≥ 80 % de acierto en validación con personas no vistas.

## Añadir una seña

1. Añade `"<nombre en el dataset>": "<code>"` a `senavoz_training/labels.py`.
2. Añade `("<code>", "<texto>")` a `DEFAULT_PHRASES` en `backend/app/services/phrase_service.py`.
3. Vuelve a entrenar y recompila la app (`npm run build:win`).

## Paridad con la app

- `scripts/make_landmarks_fixture.py` regenera el fixture que comprueba que la app y
  `preprocess.py` normalizan igual (tests en Vitest y pytest).
- `python -m scripts.export_gru_fixture` regenera el de la GRU en TypeScript.

Resultados de la prueba previa: `FINDINGS.md`.
