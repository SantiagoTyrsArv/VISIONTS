# LSC-54: resultados de la prueba previa

Fecha: 2026-10-14

Estado: **parcial**. Solo se pudo descargar `sample.json` (1 persona, 14 vídeos). El `datos.json` completo pesa 51,39 GB y no se descargó (ver "Descarga y licencia"). El vocabulario sale del listado de los vídeos crudos (`RawVideos/*.zip`, leído sin descargarlo entero). Lo que dependa de los JSON completos queda marcado como **por confirmar**.

## Descarga y licencia

- Dataset: Mora-Zarate Juan E., Universidad de La Sabana, Science Data Bank, versión 4 (2025-08-24). DOI 10.57760/sciencedb.25639.
- Licencia en la página: **CC BY-NC 4.0** (<https://creativecommons.org/licenses/by-nc/4.0/>). Texto exacto del dataset: `CC BY-NC 4.0`.
- Descarga anónima, sin registro: `https://china.scidb.cn/download?fileId=<id>&dataSetType=undefined&fileName=<nombre>` (admite `Range`). Lista de ficheros: `POST https://www.scidb.cn/api/gin-sdb-filetree/public/file/childrenFileListByPath` con `{"dataSetId":"0fa5acc6293543bba9a39a822988843e","version":"V4","path":"/","lastIndex":0,"pageSize":50}` (con `path` = `/V4/RawVideos` lista los zips).
- Ficheros (V4):

| Fichero | Tamaño | fileId | MD5 |
|---|---|---|---|
| `README.ipynb` | 10,06 KB | `743bb740a0ad96fd0f766e7f48fa7926` | bb84c5e3a746fc7301e64a25ca25afef |
| `sample.json` | 258,2 MB | `cc9685acdf18e3d005eb27bc6da97ec6` | b4196c4833da376bc31ac3c187212f38 |
| `datos.json` | **51,39 GB** (55 178 894 680 B) | `bef1a180dba2259b3bcd7de6bc62e3df` | cd6e8acd482b2ec1b6bfebc26a699d23 |
| `RawVideos/Videos Courtesy.zip` | 485 MB | `76fa12dbe08e6d7e08549d80447ab1bd` | 52a3d816ee36bc665bc3a34e3260719d |
| `RawVideos/Videos Colors.zip` | 294 MB | `b07b8f10b384965b6067b0bebfad040a` | 061e743579451cc762ad181ee78d7508 |
| `RawVideos/Videos Numbers.zip` | 190 MB | `667b87e99c7a35f756fdfa9a031ff4a6` | 661913a2eed223cd5cbed5033f9a5645 |

- En disco ahora: `training/data/lsc54/` contiene `README.ipynb` y `sample.json` (~259 MB, MD5 verificado).
- **Problema de tamaño:** `datos.json` es un único JSON de 51 GB (cada frame lleva 478 puntos de cara + 33 de pose + 2 manos, y hay 5 repeticiones por vídeo). No se puede cargar con `json.load`; hace falta un parser en streaming (p. ej. `ijson`). Velocidad medida: ~1-2 MB/s incluso con 8 conexiones `Range` en paralelo, es decir, del orden de 10 h. Alternativas: (a) descargar los tres zips de vídeo (~970 MB) y extraer los landmarks con MediaPipe (el README incluye el código y los modelos); (b) descargar `datos.json` por rangos solo para las señas elegidas (está ordenado persona, tema, seña, con sangría fija).

## Estructura

`persona > tema > seña > vídeo > repetición > frame > {r_hand, l_hand, face, pose}`, cada uno `{"x": [...], "y": [...], "z": [...]}`.

- Ruta de ejemplo: `data["Signer_1"]["Cordialidad"]["Apoyar"]["vid_0"]["rep_0"]["frame_0"]["r_hand"]["x"]`.
- Claves de persona: `Signer_<n>`. Vídeos: `vid_0`, `vid_1`... Repeticiones: `rep_0`..`rep_4`. Frames: `frame_0`..`frame_<N-1>` sin huecos.
- Cada mano: 21 valores por eje; `pose`: 33; `face`: 478 (en la muestra con `null`).
- `rep_0` existe siempre (14 de 14 vídeos de la muestra). **5 repeticiones por vídeo**, todas con el mismo nº de frames. Son traslaciones horizontales (la muñeca de `rep_1` está 0,09-0,17 más a la derecha que la de `rep_0`), como dice la spec: usar solo `rep_0`.
- Coordenadas normalizadas de imagen (0-1), vídeo de 640x360.
- Tema en la muestra: `Cordialidad`. En los vídeos crudos: `Cordialidad`, `Colores`, `Numeros` (zip Numbers) y `Números` (resto en el zip Courtesy, 1 persona). **Por confirmar** con el JSON completo cuál usa el de números.
- Las claves de seña son exactamente los nombres de directorio de los vídeos (`Baño` con U+00F1; erratas del dataset como `dies`, `Denada`, `Maso Menos` se conservan).
- Los vídeos de la muestra no coinciden 1:1 con los `.avi` (Signer_1 Apoyar: 2 `vid_` en el JSON, 3 `.avi` en el zip).

## Vocabulario (tema, seña, nº vídeos, nº personas)

Conteo de **vídeos crudos (.avi)** por seña, de los zips; es el mejor proxy sin el JSON completo (el JSON puede diferir: **por confirmar**). Los identificadores de persona en los zips son 1-34 (Courtesy y Numbers: 18 personas; Colors: 20; el artículo habla de 22: no cuadra, **por confirmar**). Aparecen las 33 frases de cortesía completas (no solo las 11 del artículo); 11 tienen 18 personas y 22 solo 9.

"Útil en reunión" = criterio propio para videollamada: saludos, cortesía, sí/no, ayuda, disculpa, gracias, espera.

| Tema | Seña (clave exacta) | Vídeos | Personas | Útil en reunión |
|---|---|---|---|---|
| `Cordialidad` | `Apoyar` | 26 | 9 |  |
| `Cordialidad` | `Ayudar` | 54 | 18 | sí |
| `Cordialidad` | `Baño` | 26 | 9 |  |
| `Cordialidad` | `Bien` | 54 | 18 | sí |
| `Cordialidad` | `Bienvenido` | 28 | 9 | sí |
| `Cordialidad` | `Buenas Noches` | 57 | 18 | sí |
| `Cordialidad` | `Buenas tardes` | 55 | 18 | sí |
| `Cordialidad` | `Buenos dias` | 54 | 18 | sí |
| `Cordialidad` | `Chao` | 55 | 18 | sí |
| `Cordialidad` | `Como esta` | 29 | 9 | sí |
| `Cordialidad` | `Con gusto` | 28 | 9 | sí |
| `Cordialidad` | `Denada` | 55 | 18 | sí |
| `Cordialidad` | `Esperar` | 27 | 9 | sí |
| `Cordialidad` | `Excelente` | 27 | 9 | sí |
| `Cordialidad` | `Gracias` | 26 | 9 | sí |
| `Cordialidad` | `Hola` | 53 | 18 | sí |
| `Cordialidad` | `Invitar` | 27 | 9 |  |
| `Cordialidad` | `Lo siento` | 28 | 9 | sí |
| `Cordialidad` | `Mal` | 51 | 18 | sí |
| `Cordialidad` | `Maso Menos` | 28 | 9 |  |
| `Cordialidad` | `Muchas Gracias` | 28 | 9 | sí |
| `Cordialidad` | `Muy Bien` | 26 | 9 | sí |
| `Cordialidad` | `Muy mal` | 29 | 9 |  |
| `Cordialidad` | `Necesitar` | 26 | 9 | sí |
| `Cordialidad` | `No` | 28 | 9 | sí |
| `Cordialidad` | `Perdon` | 53 | 18 | sí |
| `Cordialidad` | `Perfecto` | 27 | 9 | sí |
| `Cordialidad` | `Permiso` | 28 | 9 | sí |
| `Cordialidad` | `Por favor` | 55 | 18 | sí |
| `Cordialidad` | `Presentar` | 30 | 9 |  |
| `Cordialidad` | `Sentarse` | 28 | 9 |  |
| `Cordialidad` | `Si` | 26 | 9 | sí |
| `Cordialidad` | `Tranquilo` | 26 | 9 | sí |
| `Números` | `cinco` | 3 | 1 |  |
| `Números` | `cuatro` | 3 | 1 |  |
| `Números` | `dies` | 3 | 1 |  |
| `Números` | `dos` | 3 | 1 |  |
| `Números` | `nueve` | 3 | 1 |  |
| `Números` | `ocho` | 3 | 1 |  |
| `Números` | `seis` | 3 | 1 |  |
| `Números` | `siete` | 3 | 1 |  |
| `Números` | `tres` | 3 | 1 |  |
| `Números` | `uno` | 3 | 1 |  |
| `Colores` | `amarillo` | 101 | 20 |  |
| `Colores` | `azul` | 101 | 20 |  |
| `Colores` | `blanco` | 100 | 20 |  |
| `Colores` | `cafe` | 101 | 20 |  |
| `Colores` | `gris` | 101 | 20 |  |
| `Colores` | `morado` | 101 | 20 |  |
| `Colores` | `naranja` | 101 | 20 |  |
| `Colores` | `negro` | 101 | 20 |  |
| `Colores` | `rojo` | 101 | 20 |  |
| `Colores` | `rosado` | 101 | 20 |  |
| `Colores` | `verde` | 101 | 20 |  |
| `Numeros` | `cinco` | 55 | 18 |  |
| `Numeros` | `cuatro` | 53 | 18 |  |
| `Numeros` | `dies` | 57 | 18 |  |
| `Numeros` | `dos` | 54 | 18 |  |
| `Numeros` | `nueve` | 55 | 18 |  |
| `Numeros` | `ocho` | 51 | 18 |  |
| `Numeros` | `seis` | 54 | 18 |  |
| `Numeros` | `siete` | 55 | 18 |  |
| `Numeros` | `tres` | 55 | 18 |  |
| `Numeros` | `uno` | 53 | 18 |  |

Señas útiles con **≥ 15 personas**: `Hola`, `Chao`, `Buenos dias`, `Buenas tardes`, `Buenas Noches`, `Bien`, `Mal`, `Ayudar`, `Perdon`, `Por favor`, `Denada` (18 cada una). Las muy útiles `Gracias`, `Si`, `No`, `Lo siento`, `Muchas Gracias` tienen solo 9 personas: con validación por persona (~20 %) quedarían 1-2 personas, poco fiable.

## Manos

- Mano ausente en el dataset: **por confirmar**. En los 677 frames de la muestra (y en unos 515 bloques de mano inspeccionados en 16 puntos repartidos de `datos.json`) las dos manos están siempre presentes, con 21 puntos y valores normales; no se vio `None`, lista vacía ni ceros. Tampoco hay frames consecutivos idénticos (no hay *forward fill* detectable). `preprocess.py` debe tratar como ausente `None`, listas vacías, ceros y `NaN`.
- `r_hand` corresponde a: **la mano izquierda de la persona** (y `l_hand` a su mano derecha). Evidencia (Signer_1, 677 frames): la muñeca de `l_hand` está más cerca del punto de pose 16 (muñeca derecha) en el 100 % de los frames; la de `r_hand` más cerca del 15 (muñeca izquierda) en 669 de 677 (los 8 restantes, manos juntas). Posición media en x: `l_hand` 0,129 y pose16 0,129; `r_hand` 0,332 y pose15 0,334. Es decir, el vídeo no está en espejo (la derecha de la persona queda a la izquierda de la imagen) y las etiquetas siguen la convención del Hand Landmarker (`Left` = derecha de la persona con imagen sin espejo). Solo una persona: por confirmar con más.
- `handedness` de la app para la mano derecha de la persona con imagen sin espejo: **Left**. Dictamen: MediaPipe Hand Landmarker asume imagen en espejo: con la webcam sin espejo, la mano derecha de la persona se etiqueta "Left" (por confirmar en la prueba manual de la Tarea 10).
- Correspondencia elegida: posición 0 de la app (etiqueta `Left` = mano derecha de la persona) corresponde a la clave del dataset con la mano derecha de la persona: **`SLOT0_KEY = "l_hand"`, `SLOT1_KEY = "r_hand"`** (`l_hand` pasa a la posición 0, `r_hand` a la 1). Si la Tarea 10 desmiente el dictamen, se corrige el lado de la app, no esta correspondencia.

## Tiempo

- **Frames por vídeo: no son 30.** La muestra tiene 40-74 frames por vídeo (14 vídeos: 40, 40, 43, 44, 45, 45, 45, 46, 47, 48, 51, 54, 55, 74); en la versión 4 no hay remuestreo a 30 frames (la hipótesis de la spec, 30 frames a 137 ms, no se cumple en estos datos). Los `.avi` crudos son de **30 fps** (33 333 µs por frame, 640x360) y tienen 26-212 frames (muestra de 61 vídeos de Courtesy: p10 37, p25 45, mediana 64, p75 119, p90 159), es decir 0,9-7 s. Los frames del JSON no llevan marca de tiempo.
- Intervalo medio entre frames: **33,3 ms** (30 fps) si el JSON conserva todos los frames del vídeo (**por confirmar**: en la muestra, `Apoyar vid_0` tiene 45 frames y el primer `.avi` de la misma seña, 33). Los 137 ms del artículo no se pudieron comprobar.
- Una seña típica (40-75 frames) dura 1,3-2,5 s a 30 fps.
- Valores elegidos: `FRAME_INTERVAL_MS = 66` (un frame de cada 2 a 30 fps; 30 frames ≈ 2 s, cubre la seña mediana de unos 64 frames de vídeo) y `HAND_HOLD_FRAMES = 3`. Ya están en `landmarks.ts`.
  - Descartados: 50 ms (1,5 s, recorta más señas) y 33 ms (1 s).
  - `HAND_HOLD_FRAMES = 3` se mantiene: en la muestra no se puede medir (no hay manos perdidas ni *forward fill* visible). A 50 ms por frame son 150 ms de tolerancia.

## Precisión (validación por persona)

Resultado (2026-10-20, `build --dry-run`, semilla 0): **solo 3 señas pasan el 80 %**: `bad` 1,0, `good_afternoon` 0,89 y `good_morning` 1,0 (`neutral` 0,99). **No se cumple el criterio de 4 señas.**

Primera ronda de entrenamiento (antes de pasar las débiles a `neutral`), división por defecto (7 personas de validación de 35):

| seña | acierto | seña | acierto |
| --- | --- | --- | --- |
| bad | 1,0 | help | 1,0 |
| bye | 0,44 | please | 0,78 |
| good | 0,56 | sorry | 1,0 |
| good_afternoon | 0,89 | welcome | 1,0 |
| good_evening | 0,89 | neutral | 0,97 |
| good_morning | 1,0 | hello | 0,67 |

`yes`, `no` y `thanks` no tienen a nadie en validación: no se miden (y `build_model` las dejaría pasar sin medir: **bug** por corregir).

Problemas observados:

- **Validación muy ruidosa.** De las 7 personas de validación solo unas 3 hicieron Cordialidad: unas 9 muestras por seña, así que un fallo baja a 0,89. Con la validación elegida entre las 18 personas de Cordialidad (4 personas, ~12 muestras por seña), tres divisiones distintas dan resultados muy diferentes. Por ejemplo, `welcome` sale con 0,36, 0,50 y 0,92, y `bad` con 0,82, 0,58 y 0,33. Solo los saludos (`good_morning`, `good_afternoon`, `good_evening`) quedan en ≥ 0,75 en las tres.
- **Las rondas en cascada empeoran el resultado.** Al pasar a `neutral` las señas débiles, la clase `neutral` aprende movimientos parecidos a las señas buenas, y en la siguiente ronda caen más señas.
- **Desequilibrio de clases:** 2231 muestras `neutral` frente a ~54 por seña. Ponderar la pérdida por clase (inversa o raíz de la frecuencia) **empeora**: `neutral` baja a 0,30–0,80, con muchos falsos positivos.

Conclusión: con 18 personas y ~3 vídeos por persona y seña, la GRU no generaliza de forma fiable a personas nuevas.

## Decisión

**Provisional: seguir.** Hay 11 señas útiles en una reunión con 18 personas cada una (≥ 15): `Hola`, `Chao`, `Buenos dias`, `Buenas tardes`, `Buenas Noches`, `Bien`, `Mal`, `Ayudar`, `Perdon`, `Por favor`, `Denada` (se piden ≥ 4). Condiciones antes de la Tarea 6: (1) ~~conseguir los datos completos~~ **resuelto**: los landmarks se extraen de los vídeos crudos (~970 MB) con el mismo Hand Landmarker que la app (ver "Fuente de datos"); (2) confirmar duración y nº de frames por vídeo; (3) la precisión real manda sobre esta decisión.

## Fuente de datos (decisión, 2026-10-19)

No se usa `datos.json`. Los landmarks se extraen de `RawVideos/*.zip` con MediaPipe Hand Landmarker (`training/senavoz_training/extract.py`, Tarea 5). Motivos:

- **Paridad entrenamiento ⇄ app:** `datos.json` lleva 478 puntos de cara y 33 de pose, es decir, se generó con MediaPipe Holistic, otro detector con otras coordenadas, otras pérdidas de mano y otra convención de lados. Extraer con el detector de la app elimina ese desfase y las dudas de "Manos" (mano ausente, `l_hand`/`r_hand`).
- **Tamaño:** ~970 MB frente a 51 GB (≈ 10 h de descarga).
- **Repetible:** si cambia el modelo de MediaPipe o la normalización, se regenera la caché.

La correspondencia `SLOT0_KEY`/`SLOT1_KEY` de "Manos" deja de usarse: las manos se colocan por la `handedness` del Hand Landmarker con la misma regla que la app.

Mejora opcional, fuera de este plan: preentrenar la GRU con un dataset grande de landmarks de MediaPipe (p. ej. *Google Isolated Sign Language Recognition*, ASL, ~94 000 ejemplos; revisar licencia) y ajustarla con LSC-54. Solo si la precisión por persona se queda corta.

## Extracción (Tarea 5, 2026-10-20)

`python -m senavoz_training.extract` sobre los tres zips de `RawVideos/` (MD5 comprobados): **2880 vídeos** procesados (Cordialidad 1198, Colores 1110, Numeros 542 + `Números` 30: el zip trae las dos grafías), 75 358 frames guardados (uno de cada 2). **28,3 % de los frames sin ninguna mano** (sobre todo al principio y al final de cada vídeo, con las manos bajadas); 43 vídeos no tienen manos en ningún frame y `load_lsc54` los descarta. Las señas de `SIGN_TO_CODE` tienen 18 personas, salvo `Si`, `No` y `Gracias` (9).

## Modelo final (2026-10-23)

Validación cruzada por persona sin fuga: la parada temprana de cada modelo usa un grupo de personas distinto del que se mide (antes eran las mismas, lo que inflaba el acierto unos 5–10 puntos justo en el umbral).

| seña | acierto (personas no vistas) | antes, con fuga |
| --- | --- | --- |
| good_morning | **0,86** | 0,93 |
| good_afternoon | **0,81** | 0,89 |
| neutral | 0,99 | 0,98 |

`good_evening`, `please`, `help` y `bad` (0,80–0,94 con fuga) quedan por debajo del 80 % y pasan a `neutral`. `val_accuracy` global: 0,986, dominado por `neutral`.

**Decisión del autor:** se acepta el modelo con 2 señas aunque la spec pedía 4. El catálogo es mixto: el resto de frases se dice con clic o atajo. Mejora posible, fuera de alcance: preentrenar con un dataset grande de otra lengua de señas.
