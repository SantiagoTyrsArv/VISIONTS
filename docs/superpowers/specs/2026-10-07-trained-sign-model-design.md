# SeñaVoz — Modelo de señas entrenado por usuario

> **Sustituida** el 2026-10-14 por `2026-10-14-global-sign-model-design.md`: ya no hay entrenamiento por usuario.

Fecha: 2026-10-07 · Estado: aprobado en conversación, pendiente de revisión escrita

## Contexto y objetivo

La app ya detecta manos con MediaPipe y tiene el contrato de clasificación (`SignClassifier`, umbral y cooldown), pero no hay modelo entrenado: hoy ninguna seña produce una frase. Esta entrega cierra las Fases 2 (captura de datos) y 3 (entrenamiento e inferencia) del roadmap de `docs/ARCHITECTURE.md`.

**Criterio de éxito:** un usuario graba desde la app al menos 20 muestras de "Reposo" y de 2 o más frases, pulsa "Entrenar modelo" y, en menos de un par de minutos, la pantalla Cámara y el Modo reunión dicen la frase cuando hace una seña entrenada. La app muestra la precisión de validación medida por frase. En el PC del usuario no queda guardada ninguna muestra ni ningún modelo. Tests en verde.

## Requisitos del producto que guían el diseño

SeñaVoz debe ser "como una app cualquiera": fácil de ejecutar, ligera y sin datos sensibles guardados en el equipo del usuario, con la seguridad habitual. De ahí salen tres reglas:

1. **Nada personal en disco local.** Las muestras se suben al momento y no se escriben en disco; el modelo vive solo en memoria.
2. **El trabajo pesado va al servidor.** El entrenamiento (PyTorch) corre en el backend; la app no incorpora librerías de entrenamiento.
3. **Sin runtimes pesados en la app.** La inferencia se hace con TypeScript propio, sin TF.js ni ONNX Runtime.

## Decisiones tomadas

| Tema | Decisión | Descartado |
|---|---|---|
| Origen de los datos | **El usuario graba sus señas desde la app**; modelo por usuario | Dataset público (pocos datasets que encajen con el catálogo); modelo base + ajuste fino (para más adelante) |
| Almacenamiento de muestras | **Backend (PostgreSQL)**, asociado a la cuenta, borrable por el usuario | En el PC (datos sensibles en el dispositivo) |
| Entrenamiento | **Servicio `trainer` en el backend con PyTorch CPU** | En la app con TF.js (datos locales, más peso) |
| Inferencia | **GRU en TypeScript puro**, verificada contra PyTorch | ONNX Runtime Web (~10 MB más); inferencia en el servidor (latencia y envío continuo durante las reuniones) |
| Modelo en la app | **Solo en memoria**, descargado al iniciar sesión | Caché en disco (dato derivado de la persona) |

## Arquitectura

```
 App (renderer)                                   Backend
 ─────────────────────────────                    ──────────────────────────────────────
 Entrenar ─ cámara + MediaPipe ─ 30×126 ──POST /samples──▶ sign_samples
          ─ "Entrenar modelo" ────────────POST /models/train─▶ sign_models (queued)
                                                                  │
                                                     trainer (PyTorch) ─▶ sign_models (ready,
                                                                  │        weights, metrics)
 Sesión ── GET /models/status  ◀──────────────────────────────────┘
        ── GET /models/ready/weights ─▶ GruModel (memoria)
 Cámara / Modo reunión ─ MediaPipe ─ 30×126 ─ GruModel ─ SignClassifier ─ frase + voz
```

## 1. Grabación de muestras (app)

**Pantalla "Entrenar"** nueva en la barra lateral (`routes/Train.tsx`).

- Lista las frases del catálogo (`GET /phrases`) más la clase **Reposo** (etiqueta `neutral`: manos quietas, bajadas o fuera de cuadro). Cada fila muestra "N / 20 muestras", un botón **Grabar** y "Borrar muestras".
- **Sesión de grabación** para la etiqueta elegida: vista de cámara, cuenta atrás 3‑2‑1, ráfaga de 30 frames (unos 1 s), pausa de 1 s y repetición; por defecto 5 ráfagas por sesión, con botón **Parar**. Un indicador muestra si se ven manos.
- **Control de calidad:** se descarta (sin subir) una ráfaga en la que se detectan manos en menos de la mitad de los frames, salvo en Reposo. Se avisa con "No se vieron tus manos; repite la seña".
- **Subida inmediata:** cada ráfaga aceptada se envía con `POST /samples` y no se escribe en disco. Si la subida falla, la ráfaga se pierde, se muestra el error y la sesión se detiene; no hay cola local.
- **Botón "Entrenar modelo":** activo cuando Reposo y al menos 2 frases tienen 20 muestras o más. Las frases por debajo del mínimo no se entrenan y no se reconocen. Mientras entrena se muestra "Entrenando…"; al terminar, la precisión de validación por frase, con un aviso "graba más muestras" en las que bajen del 80 %.
- **Reutilización:** la captura reutiliza el reconocedor de MediaPipe y `LandmarkSequenceBuffer` (normalización a la muñeca, 30 × 126). La lógica de ráfaga (cuenta atrás, recuento de frames con manos, descarte) va en un módulo puro y testeable, separado de la pantalla.
- **Ajustes › Datos de entrenamiento:** botón **"Borrar todos mis datos de entrenamiento"** con confirmación; llama a `DELETE /samples`, que borra muestras y modelos.

## 2. Backend y entrenamiento

### Tablas (migración Alembic `0002`)

- **`sign_samples`**: `id` (uuid), `user_id` (FK a `users`, `ON DELETE CASCADE`, índice), `label` (string ≤ 50), `data` (`bytea`: 3.780 `float32` little-endian, 15.120 bytes), `created_at`. Índice `(user_id, label)`.
- **`sign_models`**: `id` (uuid), `user_id` (FK, `ON DELETE CASCADE`), `status` (`queued` | `training` | `ready` | `failed`), `labels` (JSON, lista ordenada; incluye `neutral`), `weights` (JSON, nullable), `metrics` (JSON, nullable: `{"val_accuracy": float, "per_label": {label: float}, "samples": {label: int}}`), `error` (texto, nullable), `created_at`, `finished_at`. Por usuario se conserva el último `ready` y, como mucho, uno `queued`/`training`; al quedar listo un modelo nuevo se borran los anteriores de ese usuario.

### Endpoints (todos requieren JWT; cada usuario solo accede a lo suyo)

| Método y ruta | Respuesta | Reglas |
|---|---|---|
| `POST /samples` `{label, frames: number[3780]}` | 201 `{id}` | `label` ∈ códigos del catálogo ∪ `{neutral}` (si no, 422). Exactamente 3.780 números finitos con valor absoluto ≤ 2 (si no, 422). Máximo 100 muestras por etiqueta y usuario (409). Límite de peticiones: 60/min por usuario (429). |
| `GET /samples/summary` | 200 `{counts: {label: int}}` | |
| `DELETE /samples?label=…` | 204 | Borra las muestras de esa etiqueta. |
| `DELETE /samples` | 204 | Borra todas las muestras y todos los modelos del usuario. |
| `POST /models/train` | 202 `{id, status}` | 409 si hay un modelo `queued`/`training`. 422 si `neutral` y al menos 2 frases no tienen 20 muestras cada una. Entrena con las etiquetas que llegan al mínimo. |
| `GET /models/status` | 200 `{ready, latest}` | `ready`: el último modelo listo `{id, labels, metrics, created_at}` o `null`. `latest`: el entrenamiento más reciente posterior a `ready` `{id, status, error, created_at}` (`queued`, `training` o `failed`) o `null`. |
| `GET /models/ready/weights` | 200 JSON de pesos | 404 si no hay modelo `ready`. Cabecera `Cache-Control: no-store`. |

### Servicio `trainer`

- Nuevo servicio en `docker-compose.yml`, con la misma imagen del backend y el comando `python -m app.training.worker`. Revisa `sign_models` cada 3 s, toma el `queued` más antiguo con `SELECT … FOR UPDATE SKIP LOCKED`, lo pasa a `training`, entrena y lo deja `ready` con pesos y métricas, o `failed` con el error.
- Al arrancar marca como `failed` ("Entrenamiento interrumpido") los modelos que hayan quedado en `training`.
- PyTorch CPU se instala desde el índice de CPU (`requirements-train.txt`) para no arrastrar CUDA; la API sigue sin importarlo.

### Modelo y entrenamiento

- **Arquitectura:** `GRU(input=126, hidden=64, 1 capa, batch_first)` → último estado oculto → `Linear(64, n_labels)` → softmax. Unos 37.000 parámetros.
- **Datos:** división estratificada 80/20 con semilla fija. Aumento de datos solo en entrenamiento: ruido gaussiano (σ = 0,01), escala aleatoria (0,9–1,1) y desplazamiento temporal de ±3 frames con relleno por borde.
- **Optimización:** Adam (lr = 1e‑3), lotes de 32, hasta 150 épocas, parada temprana con paciencia 20 sobre la pérdida de validación; se conservan los mejores pesos. Tiempo máximo de 5 minutos, tras el cual el modelo pasa a `failed`.
- **Métricas:** precisión de validación global y por etiqueta, y número de muestras usadas por etiqueta.
- **Formato de pesos (JSON, versión 1):**
  ```json
  {"format": "senavoz-gru-v1", "input_size": 126, "hidden_size": 64,
   "labels": ["agree", "neutral", "thanks"],
   "gru": {"weight_ih": [[...]], "weight_hh": [[...]], "bias_ih": [...], "bias_hh": [...]},
   "head": {"weight": [[...]], "bias": [...]}}
  ```
  Los tensores siguen la convención de PyTorch (`weight_ih` de forma `3·hidden × input`, puertas en orden r, z, n).

## 3. Inferencia en la app

- **`modelStore` (Zustand, solo memoria):** al iniciar sesión, al volver a la app con sesión y tras un entrenamiento, consulta `GET /models/status`. Si `ready` tiene un `id` distinto del cargado, descarga los pesos con `cache: 'no-store'`, los valida y crea un `GruModel`. Mientras `latest` esté `queued` o `training`, sondea cada 3 s. Al cerrar sesión se vacía.
- **`GruModel`** (`services/recognition/GruModel.ts`): implementa `LandmarkModel`. Paso hacia delante de la GRU según las ecuaciones de PyTorch sobre `Float32Array`, más softmax; devuelve la etiqueta de mayor probabilidad y su confianza. El constructor valida `format`, dimensiones y que todos los valores sean finitos; si algo no cuadra lanza un error, que la UI muestra como "Error al cargar el modelo".
- **Clasificación:** `createSignClassifier(model, labelToCode)` con umbral 0,8 y cooldown 1.200 ms. `labelToCode` mapea cada etiqueta a sí misma excepto `neutral`, que no está y por tanto nunca produce frase. Además, el código debe existir en el catálogo cargado.
- **Ritmo:** se clasifica cada 3 frames, con el buffer de 30 lleno, para limitar el uso de CPU durante las reuniones.
- **Dónde se usa:** pantalla **Cámara** y **Modo reunión**, a través de `useSignRecognition`. Una seña reconocida muestra la frase y la dice con `speechService`; en Modo reunión sale por VB-Cable igual que los atajos.
- **Estados de reconocimiento** en el panel: "Sin modelo: graba muestras en Entrenar" (con enlace), "Entrenando…", "Listo · precisión N %", "Error al cargar el modelo".
- **Retirar:** `MockSignRecognizer` deja de usarse fuera de los tests.
- **Peso del paquete:** se deja de empaquetar el WASM de MediaPipe sin SIMD (`vision_wasm_nosimd_internal`, unos 12 MB); Windows 10/11 en x64 siempre tiene SIMD.

## Errores

- Fallo de red al subir una muestra: error visible, la sesión de grabación se detiene y la ráfaga se pierde.
- `POST /models/train` con 409/422: mensaje concreto ("Ya hay un entrenamiento en curso" / "Faltan muestras: …").
- Entrenamiento `failed`: se muestra `error` y el botón vuelve a estar disponible; el modelo `ready` anterior, si existe, se sigue usando.
- Pesos inválidos o con otro `format`: estado de error de modelo; la cámara y los atajos siguen funcionando.
- Sesión caducada: el cliente HTTP existente renueva el token y, si no puede, envía al login.

## Seguridad y privacidad

- Solo se guardan landmarks normalizados (números), nunca vídeo ni imágenes.
- Cada endpoint filtra por el usuario del JWT; un usuario no puede leer, contar, borrar ni entrenar con datos de otro (tests de aislamiento).
- Borrado completo bajo petición (`DELETE /samples`) y en cascada al borrar la cuenta.
- Límites de tamaño, de cantidad por etiqueta y de peticiones contra abusos.
- En el PC no se escribe ninguna muestra ni ningún peso, tampoco en la caché HTTP (`no-store`).
- Los pesos descargados contienen parámetros del modelo, no las muestras.

## Pruebas

**Backend (pytest):**
- Endpoints de muestras: validación de etiqueta, longitud, valores no finitos y fuera de rango, tope por etiqueta, resumen, borrado por etiqueta y total.
- Aislamiento entre usuarios en todos los endpoints.
- `POST /models/train`: 202, 409 y 422.
- Función de entrenamiento con datos sintéticos separables: precisión de validación alta, forma y formato de los pesos.
- Worker: toma de trabajos, paso a `ready`/`failed` y recuperación de `training` interrumpidos.
- Generación del fixture de paridad (pesos, entrada y probabilidades esperadas) en `desktop/src/renderer/src/services/recognition/__fixtures__/gru-parity.json`.

**App (Vitest):**
- `GruModel`: paridad con el fixture (tolerancia 1e‑4) y rechazo de pesos inválidos.
- Lógica de ráfaga: cuenta atrás, descarte por falta de manos, excepción de Reposo.
- `modelStore`: carga solo si cambia el `id`, sondeo durante el entrenamiento, vaciado al cerrar sesión.
- Pantalla Entrenar: contadores, activación de "Entrenar modelo", errores de subida, métricas por frase.
- Cámara y Modo reunión: estados de reconocimiento y que `neutral` no habla.

**Manual:** grabar Reposo y dos frases, entrenar, y comprobar que cada seña dice su frase una sola vez en Cámara y en Modo reunión.

## Fuera de alcance

Frases personalizadas por el usuario, un modelo general compartido entre usuarios, ajuste fino sobre un modelo base, reconocimiento de lenguaje continuo, uso del modelo sin conexión (caché en disco) y afirmaciones de precisión más allá de la validación medida.
