# SeñaVoz — Modelo de señas global (LSC)

Fecha: 2026-10-14 · Estado: aprobado en conversación, pendiente de revisión escrita

Sustituye a `2026-10-07-trained-sign-model-design.md` (modelo entrenado por cada usuario).

## Contexto y objetivo

Hoy cada usuario debe grabar sus señas y entrenar su propio modelo antes de que la app reconozca nada. Eso rompe el "instalar y usar". Esta entrega lo sustituye por **un único modelo de Lengua de Señas Colombiana (LSC) que entrena el equipo una vez y que viaja dentro de la app**.

SeñaVoz es el proyecto final de una materia universitaria con alcance fijo: se elige siempre la solución más simple que cumpla, sin infraestructura pensada para crecer. El uso es académico y no comercial.

**Criterio de éxito:** tras instalar e iniciar sesión, sin ningún paso de entrenamiento, la pantalla Cámara y el Modo reunión dicen la frase cuando el usuario hace una de las señas incluidas. La app indica qué frases tienen seña. Cada seña incluida alcanza al menos un 80 % de acierto en validación con **personas que el modelo no vio al entrenar**. Tests en verde.

Este es el subproyecto 1 de 2. El subproyecto 2, que despliega el backend en Neon y Render, tiene su propia spec y se beneficia de este, porque la API deja de tener PyTorch, el servicio trainer y dos tablas.

## Decisiones tomadas

| Tema                 | Decisión                                                                                                                                                                                    | Descartado                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Origen de los datos  | **Dataset público LSC-54** (Universidad de La Sabana, 22 personas, MediaPipe, CC BY-NC 4.0, uso académico permitido con atribución)                                                         | Grabaciones propias (no hay señantes disponibles); diccionario del INSOR (una sola persona por seña); datasets de ASL o LSE (otra lengua) |
| Catálogo             | **Mixto**: las frases con datos se reconocen por seña; el resto sigue funcionando con clic y atajos                                                                                         | Catálogo solo con señas del dataset; esperar datos para las 9 frases actuales                                                      |
| Dónde vive el modelo | **JSON empaquetado en la app**; añadir una seña = reentrenar y recompilar                                                                                                                   | Servido por el backend (más piezas sin beneficio en un proyecto de alcance fijo)                                                   |
| Entrenamiento        | **Script offline** en el PC del equipo con el código PyTorch actual                                                                                                                         | Servicio trainer en producción                                                                                                     |
| Inferencia           | Sin cambios: **GRU en TypeScript puro** (`GruModel.ts`, formato `senavoz-gru-v1`)                                                                                                          | —                                                                                                                                  |

## Arquitectura

```
 Equipo (offline, una vez)                         App (renderer)
 ───────────────────────────────────────────        ─────────────────────────────────────────────
 LSC-54 (JSON) ─ preprocess.py ─ 30×126 ─ train.py   sign-model.json (empaquetado) ─ GruModel
                 (misma normalización que la app)                 │
                               └─▶ sign-model.json ──commit──▶     ▼
                                                     MediaPipe ─ ventana 30×126 ─ SignClassifier ─ frase + voz
 Backend: solo /auth, /users, /phrases, /health (sin /samples, /models ni trainer)
```

## 1. Paso previo: prueba de viabilidad sobre el dataset

Antes de tocar la app, un script de exploración (`training/explore.py`, desechable) responde estas preguntas con el dataset real. Sus respuestas fijan los parámetros marcados como **[prueba]** en el resto del documento:

1. **Vocabulario:** lista completa de las 33 frases de cortesía (el artículo solo publica 11) y nº de vídeos por seña y persona.
2. **Manos ausentes:** cómo representa el dataset una mano que nunca aparece (ceros, listas vacías u otra cosa). Las ausencias intermitentes llegan rellenadas con el valor anterior (*forward fill*).
3. **Mano derecha e izquierda:** convención de `r_hand`/`l_hand` (MediaPipe Holistic) frente a la `handedness` del Hand Landmarker de la app con la imagen sin espejo.
4. **Duración:** cada vídeo se remuestreó a 30 frames con unos 137 ms entre frames de media (≈ 4 s). La app usa hoy los últimos 30 frames de cámara (≈ 1 s a 30 fps). Hay que medir la distribución real de duraciones.
5. **Precisión:** un entrenamiento rápido con validación por persona da la precisión por seña y decide qué señas entran.

**Criterio para seguir:** al menos 4 señas útiles en una reunión con ≥ 80 % en validación por persona. Si no se alcanza, se para y se replantea con el usuario antes de seguir.

## 2. Preprocesado común (Python ⇄ TypeScript)

La normalización de la app y la del entrenamiento deben ser **idénticas**. Cambia respecto a la actual, porque un modelo entre personas necesita invariancia al tamaño de la mano y a la distancia a la cámara:

- **Traslación a la muñeca** (como hoy).
- **Escala** nueva: se divide cada mano por la distancia entre la muñeca (punto 0) y el nudillo del dedo corazón (punto 9). Si la distancia es casi cero, la mano se trata como ausente.
- **Orden:** mano izquierda primero; ceros para la mano ausente (como hoy). La equivalencia entre `l_hand`/`r_hand` y `Left`/`Right` sale de la prueba previa (§1.3).
- **Mano perdida un instante:** la app replica el *forward fill* del dataset y mantiene la última mano vista mientras no hayan pasado más de N frames sin ella **[prueba]**. Pasado ese tiempo, ceros.
- **Ventana temporal:** la app guarda 30 frames tomados a intervalo fijo Δt (no todos los de la cámara), de modo que la ventana dure lo que duran las señas del dataset **[prueba]**. Se sigue clasificando cada 3 frames de cámara.

La normalización se implementa en `landmarks.ts` y en `training/preprocess.py`. Un fixture compartido (`landmarks-parity.json`: manos en bruto → vector esperado) se comprueba en Vitest y en pytest para garantizar que no divergen.

## 3. Entrenamiento offline

Carpeta nueva **`training/`** en la raíz del repo, fuera del backend desplegado:

- `preprocess.py`: lee los JSON de LSC-54 (ruta como argumento; el dataset no se versiona), aplica §2 y genera tensores 30×126. Solo usa `rep_0` de cada vídeo: las 44 copias aumentadas son traslaciones horizontales, idénticas tras normalizar respecto a la muñeca, y falsearían la validación.
- `model.py` y `train.py`: se **mueven** desde `backend/app/training/`, sin cambios en la arquitectura (GRU 126 → 64 + capa lineal).
- **Validación por persona:** se separa a un grupo de personas (≈ 20 %) para validar, nunca muestras sueltas de las mismas personas.
- **Aumento de datos** (además del actual de escala, ruido y desplazamiento):
  - *espejo*: intercambiar manos y negar x, para personas zurdas y para errores de etiquetado de la mano;
  - *time-warp*: estirar o comprimir la secuencia ±20 %, ya que la duración de la seña varía.
- **Clase `neutral`** (nunca produce frase), compuesta por: secuencias sin manos (ceros), manos quietas (un frame repetido con ruido) y señas del dataset que no entran en el catálogo (colores, números, cortesías descartadas). Así el modelo aprende a no disparar con cualquier movimiento.
- **Salida:** `desktop/src/renderer/src/assets/sign-model.json` en formato `senavoz-gru-v1`, con dos campos opcionales nuevos que la app muestra pero no necesita: `metrics` (`val_accuracy`, `per_label`) y `source` (atribución). Los pesos se redondean a 6 cifras significativas (≈ 300–400 KB).
- Se exportan **solo** las señas que superan el 80 % por persona; las demás pasan a `neutral`.
- `README.md` de la carpeta: cómo descargar LSC-54, cómo entrenar y cómo añadir una seña (añadirla al mapa de etiquetas y al seed, reentrenar y recompilar).
- `requirements.txt` propio (PyTorch CPU, NumPy). El fixture de paridad GRU (`export_gru_fixture.py`) se mueve también aquí.

## 4. Catálogo mixto

- **Backend:** `DEFAULT_PHRASES` añade las frases de las señas que pasen la prueba previa, con un texto adecuado para una reunión (p. ej., `hola` → "Hola", `ayudar` → "Necesito ayuda", `perdon` → "Perdón"). La lista final sale de §1. El seed es idempotente, así que en bases ya creadas solo añade las nuevas.
- **App:** una frase "tiene seña" si su `code` está entre las etiquetas del modelo empaquetado; se calcula en la app y **no requiere columna nueva** en el backend. El mapa etiqueta → `code` va en el propio JSON (`labels` usa directamente el `code` de la frase).
- **Pantalla Frases:** las tarjetas con seña muestran un distintivo "Seña". Los atajos 1–9 siguen asignándose por orden del catálogo.
- **Paneles de Cámara y Modo reunión:** el estado del modelo pasa a "Modelo LSC · N señas" y deja de mostrar "entrenando" o "sin modelo".

## 5. Lo que se elimina

**App:**

- Pantalla `Train.tsx`, `train.module.css`, su entrada en la barra lateral y su ruta.
- `services/training/burstRecorder.ts` y sus tests.
- `routes/settings/TrainingDataSection.tsx` ("Borrar todos mis datos de entrenamiento").
- `samplesApi` y `modelsApi` de `api/endpoints.ts` y sus tipos.
- El store `signModel.ts` se **reescribe** en una versión mínima: carga una vez el JSON empaquetado (import dinámico, para no retrasar el arranque) y expone `status` (`loading` | `ready` | `error`), `classifier`, `labels` y `metrics`. Sin sondeos, sin red y sin vínculo con la sesión.
- `useSignRecognition`: se quitan la opción `classify` y `onFrame`, que solo usaba Entrenar; `modelStatusText` se simplifica.
- Textos de i18n que dejen de usarse.

**Backend:**

- Routers `samples.py` y `models.py`, servicios `sample_service.py` y `model_service.py`, `app/training/` (`data.py`, `worker.py` y `errors.py` se borran; `model.py` y `train.py` se mueven a `training/`), esquemas y límites de peticiones asociados.
- Tests `test_samples.py`, `test_models_api.py`, `test_worker.py`; `test_training.py` se mueve a `training/`.
- Migración **`0003`**: elimina `sign_samples` y `sign_models` (con `downgrade` que las recrea).
- `Dockerfile` vuelve a un único objetivo sin PyTorch; `requirements-train.txt` sale del backend; el servicio `trainer` sale de `docker-compose.yml`.

**Documentación:** README (uso, endpoints, tests, qué se verificó), `ARCHITECTURE.md` (diagrama, modelo de datos y decisión "Datos y modelo de señas") y atribución de LSC-54 (autores, DOI 10.57760/sciencedb.25639, CC BY-NC 4.0) en el README y en Ajustes, en una línea de créditos.

## Errores

- **JSON del modelo inválido o que no carga:** `status: 'error'`. Cámara y Modo reunión muestran "Reconocimiento de señas no disponible"; frases, atajos y voz siguen funcionando. No hay reintentos: un fallo así es un error de compilación, no de red.
- **Sin manos o con manos quietas:** la clase `neutral` y el umbral de confianza (0,8, con la pausa actual de 1,2 s entre repeticiones) evitan frases falsas.
- **Seña fuera del catálogo:** cae en `neutral` o queda bajo el umbral; no se dice nada.

## Pruebas y aceptación

- **Paridad de normalización:** el fixture compartido pasa en Vitest y en pytest.
- **Paridad de la GRU:** se mantiene la prueba actual frente a PyTorch.
- **Entrenamiento:** determinismo con semilla fija, validación por persona (ninguna persona en ambos lados) y exportación limitada a señas ≥ 80 %, con datos sintéticos en pytest.
- **App:** el store carga el modelo empaquetado y pasa a `error` con un JSON inválido; distintivo "Seña" en Frases; estado del modelo en Cámara y Reunión; la ventana temporal toma frames a intervalo Δt y rellena la mano perdida; desaparecen la ruta Entrenar y la sección de datos de entrenamiento.
- **Backend:** la migración `0003` sube y baja; los tests restantes pasan; `/samples` y `/models` responden 404.
- **Manual** (el usuario, con webcam real): hacer cada seña incluida siguiendo un vídeo de referencia (INSOR o LSC-54) en Cámara y en Modo reunión; comprobar que se dice la frase correcta y que con las manos quietas o bajadas no se dice nada. Se documenta el resultado en el README como verificado o no verificado.

## Fuera de alcance

Despliegue (subproyecto 2), grabar datos propios, personalización por usuario, servir el modelo desde el backend, frases personalizadas, lenguaje continuo y nuevas lenguas de señas.
