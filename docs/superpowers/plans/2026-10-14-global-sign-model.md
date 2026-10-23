# Modelo de señas global (LSC) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el modelo de señas entrenado por cada usuario por un único modelo LSC, entrenado offline con LSC-54 y empaquetado en la app, y quitar todo el flujo de grabación y entrenamiento.

**Architecture:** Una carpeta `training/` (fuera del backend desplegado) convierte LSC-54 en secuencias 30×126 con la misma normalización que la app, entrena la GRU actual y escribe `desktop/src/renderer/src/assets/sign-model.json`. La app carga ese JSON al arrancar y lo ejecuta con `GruModel.ts` sobre una ventana de 30 frames tomados a intervalo fijo. El backend pierde `/samples`, `/models`, el trainer, PyTorch y dos tablas.

**Tech Stack:** Python 3.12 + PyTorch CPU + NumPy (solo `training/`), FastAPI + SQLAlchemy + Alembic, Electron + React + TypeScript + Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-global-sign-model-design.md`

## Global Constraints

- **Commits:** el ejecutor **no** hace `git commit` ni `git push`. En cada paso "Commit" entrega al usuario el bloque de comandos (PowerShell) para que lo ejecute él. Los mensajes van en español con prefijo convencional (`feat:`, `fix:`, `refactor:`, `docs:`, `build:`, `test:`).
- Formato de pesos: `senavoz-gru-v1`, entrada de 126 valores, secuencia de 30 frames.
- Umbral de inclusión de una seña: **≥ 0,80** de acierto en validación con personas no vistas.
- La clase `neutral` nunca produce frase.
- Atribución obligatoria de LSC-54: Mora-Zarate, Garzón-Castro y Castellanos-Rivillas, *Data in Brief* 63 (2025) 112145, DOI 10.57760/sciencedb.25639, CC BY-NC 4.0.
- El dataset no se versiona (`training/data/` en `.gitignore`).
- Sin dependencias nuevas en la app ni en la API.
- Textos de UI solo en `desktop/src/renderer/src/i18n/es.ts`.
- Parámetros **[prueba]** (`FRAME_INTERVAL_MS`, `HAND_HOLD_FRAMES`, correspondencia de manos) se fijan en la Tarea 1 y se escriben en `training/FINDINGS.md`. Las tareas posteriores usan los valores de ese archivo; los números de este plan son los valores por defecto si la prueba no indica otra cosa.

## Review Focus

1. **Una sola mano visible, etiquetada como `Right`**: debe ir a la posición de la mano derecha (valores 63–125), no a la izquierda. Hoy se coloca primero por orden. Prueba en la Tarea 2.
2. **Mano casi encima de la cámara o degenerada** (muñeca y nudillo medio en el mismo punto): no debe producir `NaN`/`Infinity` en el vector. Prueba en la Tarea 2.
3. **La mano parpadea un frame** (MediaPipe la pierde y la recupera): la ventana debe mantener la última mano, no meter ceros. Prueba en la Tarea 3.
4. **Manos fuera de cuadro toda la ventana**: no se ejecuta la GRU ni se dice nada. Prueba en la Tarea 3.
5. **`sign-model.json` corrupto o de otro formato**: la app sigue funcionando con clic y atajos y muestra "Reconocimiento de señas no disponible". Prueba en la Tarea 8.

---

## Mapa de archivos

**Nuevos**

- `training/README.md`: descarga del dataset, entrenamiento, cómo añadir una seña y atribución.
- `training/FINDINGS.md`: resultados de la prueba previa (Tarea 1).
- `training/requirements.txt`: torch CPU, numpy y pytest.
- `training/pyproject.toml`: configuración mínima de pytest (`pythonpath = ["."]`).
- `training/senavoz_training/__init__.py`
- `training/senavoz_training/model.py`: movido desde `backend/app/training/model.py`.
- `training/senavoz_training/train.py`: movido; añade validación por persona y aumentos.
- `training/senavoz_training/preprocess.py`: normalización idéntica a `landmarks.ts`.
- `training/senavoz_training/extract.py`: extrae los landmarks de los vídeos crudos de LSC-54 con MediaPipe Hand Landmarker (mismo detector que la app) a una caché `.npy`.
- `training/senavoz_training/lsc54.py`: lectura de la caché de `extract.py` a ventanas 30×126.
- `training/senavoz_training/neutral.py`: secuencias de la clase `neutral`.
- `training/senavoz_training/labels.py`: mapa seña del dataset → `code` de frase.
- `training/senavoz_training/build.py`: CLI que genera `sign-model.json`.
- `training/scripts/explore.py`: exploración de la Tarea 1 (desechable, no se versiona).
- `training/scripts/make_landmarks_fixture.py`: genera el fixture de paridad.
- `training/scripts/export_gru_fixture.py`: movido desde `backend/scripts/`.
- `training/tests/test_preprocess.py`, `test_train.py`, `test_extract.py`, `test_lsc54.py`, `test_neutral.py`, `test_build.py`
- `desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json`
- `desktop/src/renderer/src/assets/sign-model.json`: generado por la Tarea 6.
- `backend/alembic/versions/0004_drop_sign_tables.py`

**Modificados**

- `desktop/src/renderer/src/services/recognition/landmarks.ts`: escala, posiciones por mano y mantenimiento de la mano perdida.
- `desktop/src/renderer/src/services/recognition/MediaPipeSignRecognizer.ts`: muestreo por tiempo, sin `onFrame` ni `INFERENCE_STRIDE`.
- `desktop/src/renderer/src/services/recognition/SignRecognizer.ts`: sin `LandmarkFrame`.
- `desktop/src/renderer/src/store/signModel.ts`: reescrito (modelo empaquetado).
- `desktop/src/renderer/src/hooks/useSignRecognition.ts`, `routes/Camera.tsx`, `routes/Meeting.tsx`, `routes/AppLayout.tsx`, `routes/Phrases.tsx`, `routes/Settings.tsx`, `App.tsx`, `ui/PhraseCard.tsx`, `ui/ui.module.css`, `api/endpoints.ts`, `api/types.ts`, `i18n/es.ts`
- `backend/app/main.py`, `backend/app/db/models.py`, `backend/app/core/config.py`, `backend/app/services/phrase_service.py`, `backend/tests/conftest.py`, `backend/tests/test_phrases.py`, `backend/Dockerfile`, `backend/requirements-dev.txt`, `docker-compose.yml`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/superpowers/specs/2026-10-07-trained-sign-model-design.md` (aviso de sustitución), `.gitignore`

**Eliminados**

- `backend/app/api/samples.py`, `backend/app/api/models.py`, `backend/app/schemas/samples.py`, `backend/app/services/sample_service.py`, `backend/app/services/model_service.py`, `backend/app/training/` (completo), `backend/scripts/export_gru_fixture.py`, `backend/requirements-train.txt`
- `backend/tests/test_samples.py`, `backend/tests/test_models_api.py`, `backend/tests/test_worker.py`, `backend/tests/test_training.py` (movido)
- `desktop/src/renderer/src/routes/Train.tsx`, `routes/train.module.css`, `routes/settings/TrainingDataSection.tsx`, `services/training/` (completo), `__tests__/trainScreen.test.tsx`

---

### Task 1: Prueba de viabilidad sobre LSC-54

Tarea de investigación: el código es desechable. Lo que se entrega es `training/FINDINGS.md`.

**Files:**

- Create: `training/scripts/explore.py` (no se versiona)
- Create: `training/FINDINGS.md`
- Modify: `.gitignore`

- [ ] **Step 1: Descargar el dataset**

Descargar LSC-54 desde <https://www.scidb.cn/en/detail?dataSetId=0fa5acc6293543bba9a39a822988843e> (DOI 10.57760/sciencedb.25639) y descomprimirlo en `training/data/lsc54/`. Si la descarga exige registro o falla, **parar y pedírselo al usuario**. Añadir a `.gitignore`:

```gitignore
# Dataset LSC-54 (no se versiona: tamaño y licencia)
training/data/
training/scripts/explore.py
```

- [ ] **Step 2: Escribir el explorador**

`training/scripts/explore.py`, que se ejecuta con `python -I training/scripts/explore.py training/data/lsc54`:

```python
"""Exploración de LSC-54 (desechable). Imprime lo que necesita FINDINGS.md."""

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

root = Path(sys.argv[1])
files = sorted(root.rglob("*.json"))
print("archivos JSON:", len(files))

videos = defaultdict(set)      # (tema, seña) -> {(persona, vídeo)}
hand_states = Counter()        # cómo llega una mano ausente
frame_counts = Counter()
sample = None
for f in files:
    data = json.loads(f.read_text(encoding="utf-8"))
    for signer, topics in data.items():
        for topic, signs in topics.items():
            for sign, vids in signs.items():
                for vid, reps in vids.items():
                    videos[(topic, sign)].add((signer, vid))
                    rep0 = reps.get("rep_0") or next(iter(reps.values()))
                    frame_counts[len(rep0)] += 1
                    for frame in rep0.values():
                        for side in ("l_hand", "r_hand"):
                            h = frame.get(side)
                            if not h:
                                hand_states[f"{side}: vacía/None"] += 1
                            elif all(v == 0 for v in h["x"]):
                                hand_states[f"{side}: ceros"] += 1
                            else:
                                hand_states[f"{side}: presente"] += 1
                        sample = sample or (signer, topic, sign, frame)

print("\nseñas (tema, seña): nº vídeos, nº personas")
for key, vs in sorted(videos.items()):
    print(key, len(vs), len({s for s, _ in vs}))
print("\nframes por vídeo:", frame_counts)
print("\nestado de las manos:", hand_states)
print("\nejemplo de frame:", json.dumps(sample, ensure_ascii=False)[:1500])
```

Si la estructura real no es `persona → tema → seña → vid → rep → frame`, adaptar el script a la estructura encontrada y anotarlo.

- [ ] **Step 3: Comprobar la convención de manos**

En el ejemplo impreso, mirar la x de la muñeca (`x[0]`) en `l_hand` y `r_hand` de frames con las dos manos. Con imagen sin espejo, la mano derecha de la persona aparece a la **izquierda** de la imagen (x pequeña). Anotar si `r_hand` es la mano derecha de la persona (x menor) o la de la derecha de la imagen.

Hacer lo mismo en la app: `npm run dev` en `desktop/`, abrir Cámara, levantar solo la mano derecha y anotar en la consola de DevTools la `handedness` de MediaPipe. Para verla, añadir temporalmente `console.log(result.handedness)` en `toDetectedHands` de `MediaPipeSignRecognizer.ts` y quitarlo después.

- [ ] **Step 4: Prueba rápida de precisión**

Se hace después de la Tarea 5, con `python -m senavoz_training.build --data training/data/lsc54/cache --dry-run`, que imprime la precisión por seña sin escribir el modelo. Volver aquí y anotarla.

- [ ] **Step 5: Escribir `training/FINDINGS.md`**

```markdown
# LSC-54: resultados de la prueba previa

Fecha: <AAAA-MM-DD>

## Estructura
<estructura real de los JSON; ruta de ejemplo>

## Vocabulario (tema, seña, nº vídeos, nº personas)
<tabla completa, incluidas las 33 cortesías>

## Manos
- Mano ausente en el dataset: <None | lista vacía | ceros>
- `r_hand` corresponde a: <mano derecha de la persona | lado derecho de la imagen>
- `handedness` de la app para la mano derecha de la persona con imagen sin espejo: <Left | Right>
- Correspondencia elegida: `l_hand` → posición <0|1>, `r_hand` → posición <0|1>

## Tiempo
- Frames por vídeo: <30 siempre | otro>
- Intervalo medio entre frames: <ms>, de modo que la ventana ≈ <s>
- Valores elegidos: `FRAME_INTERVAL_MS = <n>`, `HAND_HOLD_FRAMES = <n>`

## Precisión (validación por persona)
<tabla seña → acierto; señas que pasan ≥ 0,80>

## Decisión
<seguir | parar: motivo>
```

**Criterio para seguir:** al menos 4 señas útiles en una reunión con ≥ 0,80. Si no se cumple, **parar y consultar al usuario** antes de la Tarea 6.

- [ ] **Step 6: Commit (lo ejecuta el usuario)**

```powershell
git add .gitignore training/FINDINGS.md
git commit -m "docs(training): resultados de la prueba previa con LSC-54"
```

---

### Task 2: Normalización v2 en la app y fixture de paridad

**Files:**

- Modify: `desktop/src/renderer/src/services/recognition/landmarks.ts`
- Modify: `desktop/src/renderer/src/services/recognition/landmarks.test.ts`
- Create: `training/scripts/make_landmarks_fixture.py`
- Create: `desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json`

**Interfaces:**

- Produces:
  - `normalizeHand(landmarks: readonly Landmark3D[]): number[] | null`: 63 valores, o `null` si la mano es inválida o degenerada.
  - `assignHandSlots(hands: readonly DetectedHand[]): [number[] | null, number[] | null]`: posición 0 = `Left`, 1 = `Right`.
  - `normalizeHandLandmarks(hands): number[]`: 126 valores, con ceros en las posiciones vacías.
  - Constantes `SCALE_EPSILON = 1e-6`, `MIDDLE_MCP = 9`.
  - El fixture `landmarks-parity.json`, con forma `{ cases: { name: string; hands: DetectedHand[]; expected: number[] }[] }`.

- [ ] **Step 1: Generador del fixture con una fórmula de referencia independiente**

`training/scripts/make_landmarks_fixture.py`:

```python
"""Genera el fixture que comprueba que la app y el entrenamiento normalizan igual.

La fórmula de referencia está escrita aquí a propósito, separada de las dos implementaciones.
Uso (desde la raíz): python -I training/scripts/make_landmarks_fixture.py
"""

import json
import math
from pathlib import Path

OUT = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json"
)


def hand(wx, wy, wz, spread):
    return [
        {"x": wx + i * 0.01 * spread, "y": wy - i * 0.02 * spread, "z": wz + i * 0.001}
        for i in range(21)
    ]


def reference(points):
    w, m = points[0], points[9]
    scale = math.dist((w["x"], w["y"], w["z"]), (m["x"], m["y"], m["z"]))
    if scale < 1e-6:
        return None
    return [
        v
        for p in points
        for v in ((p["x"] - w["x"]) / scale, (p["y"] - w["y"]) / scale, (p["z"] - w["z"]) / scale)
    ]


def frame(hands):
    slots = [None, None]
    for h in hands:
        side = {"Left": 0, "Right": 1}.get(h.get("handedness"))
        if side is None or slots[side] is not None:
            side = slots.index(None) if None in slots else None
        if side is not None:
            slots[side] = reference(h["landmarks"])
    return [v for s in slots for v in (s if s is not None else [0.0] * 63)]


CASES = {
    "dos manos": [
        {"landmarks": hand(0.3, 0.6, 0.0, 1.0), "handedness": "Left"},
        {"landmarks": hand(0.7, 0.6, 0.0, 2.0), "handedness": "Right"},
    ],
    "solo derecha": [{"landmarks": hand(0.6, 0.5, 0.0, 1.5), "handedness": "Right"}],
    "solo izquierda": [{"landmarks": hand(0.4, 0.5, 0.0, 0.5), "handedness": "Left"}],
    "derecha antes que izquierda": [
        {"landmarks": hand(0.7, 0.6, 0.0, 2.0), "handedness": "Right"},
        {"landmarks": hand(0.3, 0.6, 0.0, 1.0), "handedness": "Left"},
    ],
    "sin handedness": [{"landmarks": hand(0.5, 0.5, 0.0, 1.0)}],
    "mano degenerada": [
        {"landmarks": [{"x": 0.5, "y": 0.5, "z": 0.0}] * 21, "handedness": "Left"}
    ],
    "sin manos": [],
}

OUT.write_text(
    json.dumps(
        {"cases": [{"name": n, "hands": h, "expected": frame(h)} for n, h in CASES.items()]},
        indent=1,
    ),
    encoding="utf-8",
)
print(f"Fixture escrito en {OUT}")
```

Run: `python -I training/scripts/make_landmarks_fixture.py`
Expected: `Fixture escrito en ...landmarks-parity.json`

- [ ] **Step 2: Tests que fallan**

Sustituir el contenido de `landmarks.test.ts` por:

```ts
import { describe, expect, it } from 'vitest';

import parity from './__fixtures__/landmarks-parity.json';
import {
  LandmarkSequenceBuffer,
  normalizeHand,
  normalizeHandLandmarks,
  SEQUENCE_LENGTH,
  type DetectedHand,
} from './landmarks';

const hand = (wx: number, wy: number, spread = 1) =>
  Array.from({ length: 21 }, (_, i) => ({
    x: wx + i * 0.01 * spread,
    y: wy - i * 0.02 * spread,
    z: i * 0.001,
  }));

describe('normalizeHandLandmarks', () => {
  it.each(parity.cases)('coincide con el fixture de paridad: $name', ({ hands, expected }) => {
    const out = normalizeHandLandmarks(hands as DetectedHand[]);
    expect(out).toHaveLength(126);
    out.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
  });

  it('pone una sola mano Right en la posición derecha', () => {
    const out = normalizeHandLandmarks([{ landmarks: hand(0.6, 0.5), handedness: 'Right' }]);
    expect(out.slice(0, 63).every((v) => v === 0)).toBe(true);
    expect(out.slice(63).some((v) => v !== 0)).toBe(true);
  });

  it('no devuelve NaN ni Infinity con una mano degenerada', () => {
    const flat = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    expect(normalizeHand(flat)).toBeNull();
    expect(normalizeHandLandmarks([{ landmarks: flat }]).every(Number.isFinite)).toBe(true);
  });

  it('es invariante al tamaño de la mano', () => {
    const small = normalizeHand(hand(0.5, 0.5, 0.5))!;
    const big = normalizeHand(hand(0.5, 0.5, 2))!;
    small.forEach((v, i) => {
      if (i % 3 !== 2) expect(v).toBeCloseTo(big[i], 6); // x e y; z no escala con spread
    });
  });

  it('ignora manos con un número de puntos distinto de 21', () => {
    expect(normalizeHandLandmarks([{ landmarks: hand(0.5, 0.5).slice(0, 20) }])).toEqual(
      Array<number>(126).fill(0),
    );
  });
});

describe('LandmarkSequenceBuffer', () => {
  it('espera 30 frames y mantiene una ventana fija de 30 × 126', () => {
    const buffer = new LandmarkSequenceBuffer();
    for (let i = 0; i < SEQUENCE_LENGTH - 1; i += 1) buffer.add([]);
    expect(buffer.isReady).toBe(false);
    buffer.add([]);
    expect(buffer.isReady).toBe(true);
    buffer.add([]);
    expect(buffer.toArray()).toHaveLength(30 * 126);
  });
});
```

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/services/recognition/landmarks.test.ts`
Expected: FAIL (`normalizeHand` no existe, la posición de una mano `Right` sola es incorrecta).

- [ ] **Step 3: Implementación**

En `landmarks.ts`, sustituir `normalizeHandLandmarks` y añadir:

```ts
/** Distancia mínima muñeca–nudillo medio; por debajo, la mano se trata como ausente. */
export const SCALE_EPSILON = 1e-6;
/** Nudillo del dedo corazón: su distancia a la muñeca fija la escala de la mano. */
export const MIDDLE_MCP = 9;

/** 63 valores trasladados a la muñeca y divididos por el tamaño de la mano, o null. */
export function normalizeHand(landmarks: readonly Landmark3D[]): number[] | null {
  if (landmarks.length !== LANDMARKS_PER_HAND) return null;
  if (landmarks.some(({ x, y, z }) => !Number.isFinite(x + y + z))) return null;
  const wrist = landmarks[0];
  const mcp = landmarks[MIDDLE_MCP];
  const scale = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y, mcp.z - wrist.z);
  if (scale < SCALE_EPSILON) return null;
  return landmarks.flatMap(({ x, y, z }) => [
    (x - wrist.x) / scale,
    (y - wrist.y) / scale,
    (z - wrist.z) / scale,
  ]);
}

const SLOT: Record<Handedness, 0 | 1> = { Left: 0, Right: 1 };

/** Posición 0 = mano Left, 1 = Right; sin handedness (o repetida), la primera libre. */
export function assignHandSlots(
  hands: readonly DetectedHand[],
): [number[] | null, number[] | null] {
  const slots: [number[] | null, number[] | null] = [null, null];
  const taken = [false, false];
  for (const hand of hands) {
    let slot: number | undefined = hand.handedness ? SLOT[hand.handedness] : undefined;
    if (slot === undefined || taken[slot]) slot = taken.indexOf(false);
    if (slot < 0) break;
    taken[slot] = true;
    slots[slot as 0 | 1] = normalizeHand(hand.landmarks);
  }
  return slots;
}

/** 126 valores: mano Left y luego Right, normalizadas; ceros para una mano ausente. */
export function normalizeHandLandmarks(hands: readonly DetectedHand[]): number[] {
  return assignHandSlots(hands).flatMap((slot) => slot ?? zeroHand());
}
```

Importante: una mano con 21 puntos pero degenerada **ocupa su posición** (queda en ceros); una mano con un número de puntos distinto de 21 se descarta antes de asignarla. Para ello, al principio de `assignHandSlots`, filtrar `hands.filter((h) => h.landmarks.length === LANDMARKS_PER_HAND)`.

- [ ] **Step 4: Comprobar que pasa**

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/services/recognition/landmarks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit (lo ejecuta el usuario)**

```powershell
git add training/scripts/make_landmarks_fixture.py desktop/src/renderer/src/services/recognition/landmarks.ts desktop/src/renderer/src/services/recognition/landmarks.test.ts desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json
git commit -m "feat(desktop): normalización de manos por escala y posición fija, con fixture de paridad"
```

---

### Task 3: Ventana temporal por tiempo y mano perdida en el reconocedor

**Files:**

- Modify: `desktop/src/renderer/src/services/recognition/landmarks.ts`
- Modify: `desktop/src/renderer/src/services/recognition/MediaPipeSignRecognizer.ts`
- Modify: `desktop/src/renderer/src/services/recognition/SignRecognizer.ts`
- Modify: `desktop/src/renderer/src/services/recognition/MediaPipeSignRecognizer.test.ts`
- Modify: `desktop/src/renderer/src/services/recognition/landmarks.test.ts`

**Interfaces:**

- Consumes: `assignHandSlots` (Tarea 2).
- Produces:
  - `FRAME_INTERVAL_MS` y `HAND_HOLD_FRAMES` (valores de `FINDINGS.md`; por defecto 133 y 3).
  - `LandmarkSequenceBuffer.add(hands): void` y `LandmarkSequenceBuffer.hasHands(): boolean`.
  - `MediaPipeSignRecognizer` deja de exportar `INFERENCE_STRIDE` y de tener `onFrame`.
  - `SignRecognizer.ts` deja de exportar `LandmarkFrame`.

- [ ] **Step 1: Tests que fallan (buffer)**

Añadir a `landmarks.test.ts`, dentro de `describe('LandmarkSequenceBuffer')`:

```ts
  it('mantiene la última mano vista durante HAND_HOLD_FRAMES frames', () => {
    const buffer = new LandmarkSequenceBuffer();
    const left: DetectedHand = { landmarks: hand(0.4, 0.5), handedness: 'Left' };
    buffer.add([left]);
    for (let i = 0; i < HAND_HOLD_FRAMES; i += 1) buffer.add([]);
    const frames = buffer.frames();
    const kept = frames[frames.length - 1];
    expect(kept.slice(0, 63)).toEqual(frames[0].slice(0, 63));
    buffer.add([]);
    expect(buffer.frames().at(-1)!.slice(0, 63).every((v) => v === 0)).toBe(true);
  });

  it('indica si alguna mano aparece en la ventana', () => {
    const buffer = new LandmarkSequenceBuffer();
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) buffer.add([]);
    expect(buffer.hasHands()).toBe(false);
    buffer.add([{ landmarks: hand(0.4, 0.5), handedness: 'Left' }]);
    expect(buffer.hasHands()).toBe(true);
  });
```

Añadir `HAND_HOLD_FRAMES` a la importación.

- [ ] **Step 2: Comprobar que fallan**

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/services/recognition/landmarks.test.ts`
Expected: FAIL (`frames`, `hasHands` y `HAND_HOLD_FRAMES` no existen).

- [ ] **Step 3: Implementación del buffer**

Sustituir `LandmarkSequenceBuffer` en `landmarks.ts`:

```ts
/** Intervalo entre frames de la ventana: 30 frames ≈ duración de una seña de LSC-54. */
export const FRAME_INTERVAL_MS = 133; // valor de training/FINDINGS.md
/** Frames que se mantiene una mano perdida, como el forward fill del dataset. */
export const HAND_HOLD_FRAMES = 3; // valor de training/FINDINGS.md

/** Últimos 30 frames normalizados; una mano perdida se mantiene unos frames. */
export class LandmarkSequenceBuffer {
  private readonly window: number[][] = [];
  private readonly present: boolean[] = [];
  private readonly last: [number[] | null, number[] | null] = [null, null];
  private readonly missing = [0, 0];

  get isReady(): boolean {
    return this.window.length === SEQUENCE_LENGTH;
  }

  add(hands: readonly DetectedHand[]): void {
    const slots = assignHandSlots(hands);
    const frame = slots.map((slot, i) => {
      if (slot) {
        this.last[i] = slot;
        this.missing[i] = 0;
        return slot;
      }
      const held = this.last[i];
      if (held && this.missing[i] < HAND_HOLD_FRAMES) {
        this.missing[i] += 1;
        return held;
      }
      this.last[i] = null;
      return zeroHand();
    });
    this.window.push(frame.flat());
    this.present.push(slots.some((s) => s !== null));
    if (this.window.length > SEQUENCE_LENGTH) {
      this.window.shift();
      this.present.shift();
    }
  }

  hasHands(): boolean {
    return this.present.some(Boolean);
  }

  frames(): readonly number[][] {
    return this.window;
  }

  toArray(): number[] {
    return this.window.flat();
  }

  clear(): void {
    this.window.length = 0;
    this.present.length = 0;
    this.last[0] = this.last[1] = null;
    this.missing[0] = this.missing[1] = 0;
  }
}
```

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/services/recognition/landmarks.test.ts`
Expected: PASS

- [ ] **Step 4: Tests que fallan (reconocedor)**

En `MediaPipeSignRecognizer.test.ts`:

- **Borrar** los tests `'emite cada frame normalizado con si hay manos'` y `'clasifica una vez cada 3 frames con el buffer lleno'`, y la importación de `LandmarkFrame`.
- Donde los tests usen puntos todos a 0 para "una mano", sustituirlos por este helper, porque una mano degenerada ya no cuenta como presente:

```ts
const handPoints = () =>
  Array.from({ length: 21 }, (_, i) => ({ x: 0.5 + i * 0.01, y: 0.5 - i * 0.02, z: 0, visibility: 1 }));
const withHand = (): HandLandmarkerResult =>
  ({
    landmarks: [handPoints()],
    worldLandmarks: [],
    handedness: [[{ categoryName: 'Left', score: 1, index: 0, displayName: 'Left' }]],
    handednesses: [],
  }) as unknown as HandLandmarkerResult;
```

- En `'normaliza timestamps repetidos y solo clasifica tras reunir 30 frames'`, avanzar `h.advance(i * FRAME_INTERVAL_MS)` en lugar de timestamps consecutivos, con `withHand()`.
- Añadir:

```ts
  it('toma un frame cada FRAME_INTERVAL_MS aunque la cámara dé más', async () => {
    h.landmarker.detectForVideo.mockReturnValue(withHand());
    const classify = vi.fn(async () => null);
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier: { classify },
    });
    await recognizer.start();
    // Cada muestra va seguida de un frame de cámara 1 ms después, que debe ignorarse.
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) {
      h.advance(i * FRAME_INTERVAL_MS);
      h.advance(i * FRAME_INTERVAL_MS + 1);
    }
    await Promise.resolve();
    expect(h.landmarker.detectForVideo).toHaveBeenCalledTimes(2 * SEQUENCE_LENGTH);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it('no clasifica si no hay manos en toda la ventana', async () => {
    const classify = vi.fn(async () => null);
    const recognizer = new MediaPipeSignRecognizer(h.video, {
      createLandmarker: async () => h.landmarker,
      scheduler: h.scheduler,
      classifier: { classify },
    });
    await recognizer.start();
    for (let i = 0; i < SEQUENCE_LENGTH + 5; i += 1) h.advance(i * FRAME_INTERVAL_MS);
    await Promise.resolve();
    expect(classify).not.toHaveBeenCalled();
  });
```

Importar `FRAME_INTERVAL_MS` y `SEQUENCE_LENGTH` desde `./landmarks`.

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/services/recognition/MediaPipeSignRecognizer.test.ts`
Expected: FAIL (se clasifica en cada frame de cámara, y también sin manos).

- [ ] **Step 5: Implementación del reconocedor**

En `MediaPipeSignRecognizer.ts`:

1. Quitar `INFERENCE_STRIDE`, `framesSinceInference`, `frameListeners`, `onFrame` y la importación de `LandmarkFrame`.
2. Añadir el campo `private lastSampleAt = -Infinity;` y reiniciarlo a `-Infinity` en `start()` y en `stop()`.
3. Importar `FRAME_INTERVAL_MS`.
4. Sustituir el cuerpo de `processFrame`, desde `const hands = toDetectedHands(result);` hasta el final del `try`, por:

```ts
      const hands = toDetectedHands(result);
      const detected = hands.length > 0;
      if (detected !== this.handsDetected) {
        this.handsDetected = detected;
        this.publishStatus({
          phase: 'ready',
          handsDetected: detected,
          modelAvailable: !!this.classifier,
        });
      }

      // La ventana se llena a ritmo fijo, no al de la cámara (ver FRAME_INTERVAL_MS).
      if (monotonicTimestamp - this.lastSampleAt < FRAME_INTERVAL_MS) return;
      this.lastSampleAt = monotonicTimestamp;
      this.sequence.add(hands);

      if (
        !this.classifier ||
        !this.sequence.isReady ||
        !this.sequence.hasHands() ||
        this.inferencePending
      ) {
        return;
      }
      this.inferencePending = true;
      const generation = this.generation;
      void this.classifier
        .classify(this.sequence.toArray())
        .then((sign) => {
          if (sign && this.running && generation === this.generation) {
            this.signListeners.forEach((callback) => callback(sign));
          }
        })
        .catch(() => {
          if (generation === this.generation) this.fail();
        })
        .finally(() => {
          if (generation === this.generation) this.inferencePending = false;
        });
```

Nota: la detección de MediaPipe sigue en cada frame de cámara para que el indicador "manos detectadas" responda al instante. Solo la ventana y la inferencia van a ritmo fijo.

5. En `SignRecognizer.ts`, borrar el tipo `LandmarkFrame`.
6. Actualizar el comentario de clase a `/** Detección local de manos y clasificación de señas con el modelo empaquetado. */`.

- [ ] **Step 6: Comprobar que pasa**

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/services/recognition`
Expected: PASS. Los errores de tipo en `useSignRecognition.ts`, `Train.tsx` y `burstRecorder.ts` por `onFrame`/`LandmarkFrame` se resuelven en la Tarea 8; **no** ejecutar todavía `npm run typecheck`.

- [ ] **Step 7: Commit (lo ejecuta el usuario)**

Se entrega junto con la Tarea 8 (este estado no compila). Anotar los archivos para ese commit.

---

### Task 4: Paquete `training/`: mover el modelo y portar la normalización

**Files:**

- Create: `training/requirements.txt`, `training/pyproject.toml`, `training/senavoz_training/__init__.py`
- Move: `backend/app/training/model.py` → `training/senavoz_training/model.py`
- Move: `backend/app/training/train.py` → `training/senavoz_training/train.py`
- Move: `backend/app/training/errors.py` → contenido integrado en `train.py`
- Move: `backend/tests/test_training.py` → `training/tests/test_train.py`
- Move: `backend/scripts/export_gru_fixture.py` → `training/scripts/export_gru_fixture.py`
- Create: `training/senavoz_training/preprocess.py`
- Create: `training/tests/test_preprocess.py`

**Interfaces:**

- Consumes: el fixture `landmarks-parity.json` (Tarea 2).
- Produces:
  - `normalize_hand(points: np.ndarray | None) -> np.ndarray | None`: `points` de forma (21, 3); devuelve (63,) o None.
  - `normalize_frame(left: np.ndarray | None, right: np.ndarray | None) -> np.ndarray`: forma (126,), float32.
  - `SignGRU`, `export_weights`, `WEIGHTS_FORMAT` y `train_model` (como hoy) en `senavoz_training.model` / `.train`.

- [ ] **Step 1: Crear el paquete y mover archivos**

```powershell
New-Item -ItemType Directory -Force training/senavoz_training, training/tests, training/scripts | Out-Null
git mv backend/app/training/model.py training/senavoz_training/model.py
git mv backend/app/training/train.py training/senavoz_training/train.py
git mv backend/tests/test_training.py training/tests/test_train.py
git mv backend/scripts/export_gru_fixture.py training/scripts/export_gru_fixture.py
```

`training/senavoz_training/__init__.py`: `"""Entrenamiento offline del modelo de señas global de SeñaVoz."""`

`training/requirements.txt`:

```text
--extra-index-url https://download.pytorch.org/whl/cpu
torch==2.14.1+cpu
numpy==2.5.3
pytest==9.1.1
```

`training/pyproject.toml`:

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

En `train.py`, sustituir `from app.training.errors import TrainingTimeout` y `from app.training.model import ...` por:

```python
from senavoz_training.model import SignGRU, export_weights


class TrainingTimeout(Exception):
    """El entrenamiento superó el tiempo máximo."""
```

En `test_train.py`: `from senavoz_training.model import WEIGHTS_FORMAT` y `from senavoz_training.train import TrainingTimeout, train_model`. En `export_gru_fixture.py`: `from senavoz_training.model import SignGRU, export_weights`, y `OUT = Path(__file__).resolve().parents[2] / "desktop/..."` (misma ruta relativa a la raíz). Actualizar su docstring a `Uso (desde training/): python -m scripts.export_gru_fixture`.

Run: `cd training; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt; .venv\Scripts\python -m pytest`
Expected: PASS (los 5 tests movidos). Añadir `training/.venv/` al `.gitignore`.

- [ ] **Step 2: Test de paridad que falla**

`training/tests/test_preprocess.py`:

```python
import json
from pathlib import Path

import numpy as np
import pytest

from senavoz_training.preprocess import normalize_frame, normalize_hand

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "desktop/src/renderer/src/services/recognition/__fixtures__/landmarks-parity.json"
)
CASES = json.loads(FIXTURE.read_text(encoding="utf-8"))["cases"]


def _points(hand):
    return np.array([[p["x"], p["y"], p["z"]] for p in hand["landmarks"]], np.float64)


def _slots(hands):
    """Misma asignación que la app: Left → 0, Right → 1, si no la primera libre."""
    slots = [None, None]
    taken = [False, False]
    for h in hands:
        side = {"Left": 0, "Right": 1}.get(h.get("handedness"))
        if side is None or taken[side]:
            side = taken.index(False) if False in taken else None
        if side is None:
            break
        taken[side] = True
        slots[side] = _points(h)
    return slots


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_parity_with_app(case):
    left, right = _slots(case["hands"])
    out = normalize_frame(left, right)
    assert out.shape == (126,) and out.dtype == np.float32
    np.testing.assert_allclose(out, np.array(case["expected"], np.float32), atol=1e-6)


def test_degenerate_hand_is_none():
    assert normalize_hand(np.full((21, 3), 0.5)) is None


def test_missing_hand_is_zeros():
    assert not normalize_frame(None, None).any()
```

Run: `cd training; .venv\Scripts\python -m pytest tests/test_preprocess.py`
Expected: FAIL (`ModuleNotFoundError: senavoz_training.preprocess`).

- [ ] **Step 3: Implementación**

`training/senavoz_training/preprocess.py`:

```python
"""Normalización de manos idéntica a desktop/.../recognition/landmarks.ts."""

import numpy as np

SCALE_EPSILON = 1e-6
MIDDLE_MCP = 9
VALUES_PER_HAND = 63


def normalize_hand(points: np.ndarray | None) -> np.ndarray | None:
    """(21, 3) → (63,): trasladada a la muñeca y dividida por muñeca–nudillo medio."""
    if points is None or points.shape != (21, 3) or not np.isfinite(points).all():
        return None
    wrist = points[0]
    scale = float(np.linalg.norm(points[MIDDLE_MCP] - wrist))
    if scale < SCALE_EPSILON:
        return None
    return ((points - wrist) / scale).reshape(-1)


def normalize_frame(left: np.ndarray | None, right: np.ndarray | None) -> np.ndarray:
    """126 valores: izquierda y derecha; ceros para una mano ausente o degenerada."""
    out = np.zeros(2 * VALUES_PER_HAND, np.float32)
    for i, hand in enumerate((left, right)):
        norm = normalize_hand(hand)
        if norm is not None:
            out[i * VALUES_PER_HAND : (i + 1) * VALUES_PER_HAND] = norm
    return out
```

- [ ] **Step 4: Comprobar que pasa**

Run: `cd training; .venv\Scripts\python -m pytest`
Expected: PASS

- [ ] **Step 5: Commit (lo ejecuta el usuario)**

Se entrega junto con la Tarea 7, que borra el resto de `backend/app/training/`. Este paso deja el backend sin `model.py`/`train.py` mientras `worker.py` aún los importa.

---

### Task 5: Datos LSC-54, clase `neutral`, validación por persona y aumentos

> **Enmienda (2026-10-14, tras la Tarea 1).** `datos.json` pesa 51 GB y no coincide con los vídeos. Los landmarks se extraen **de los vídeos crudos** (`RawVideos/*.zip`, ~970 MB, 30 fps; URLs y fileId en `training/FINDINGS.md`) con **MediaPipe Hand Landmarker**: el mismo detector y el mismo modelo que la app (`desktop/src/renderer/public/models/hand_landmarker.task`). Así las etiquetas `Left`/`Right` y las manos ausentes son idénticas a las de la app. Steps 1–2 se sustituyen por los Steps 1E–2E. Los Steps 3–6 siguen igual: `load_lsc54` mantiene su firma `load_lsc54(root) -> list[Sample]`, pero lee la caché de la extracción.
>
> **Constantes:** `FRAME_INTERVAL_MS = 66` (un frame de cada 2 a 30 fps; ventana de 30 frames ≈ 2 s) y `HAND_HOLD_FRAMES = 3`, iguales en `landmarks.ts`.
>
> **Step 1E: extracción con caché.** `training/senavoz_training/extract.py`:
>
> - `extract_video(path, landmarker) -> np.ndarray` de forma (T, 126) float32: abre el `.avi` con OpenCV y toma un frame de cada 2 (índices 0, 2, 4…). Por cada frame llama a `landmarker.detect_for_video(mp.Image(SRGB), timestamp_ms)` con timestamps crecientes (`índice × 1000 / fps`). Coloca cada mano por su `handedness` con **la misma regla que `assignHandSlots`** (Left → 0, Right → 1, repetida o sin etiqueta → primera libre) y normaliza con `normalize_frame`.
> - Aplica a la secuencia el mismo mantenimiento de mano perdida que `LandmarkSequenceBuffer` (`hold_missing(seq, HAND_HOLD_FRAMES)`), para que el entrenamiento vea lo mismo que la app.
> - `extract_all(zips_dir, cache_dir)`: recorre los zips sin descomprimirlos del todo (extrae cada `.avi` a un temporal), obtiene `(tema, seña, persona)` de la ruta dentro del zip y guarda `cache_dir/<tema>/<seña>/<persona>__<n>.npy`. Si el `.npy` existe, no lo recalcula. Muestra el progreso.
> - Opciones del landmarker: `running_mode=VIDEO`, `num_hands=2` y los umbrales por defecto, como en la app.
> - CLI: `python -m senavoz_training.extract --zips data/lsc54/RawVideos --cache data/lsc54/cache`.
> - Tests (`training/tests/test_extract.py`): `hold_missing`, y la asignación de posiciones con un landmarker falso (objeto con `detect_for_video` que devuelve resultados construidos a mano, sin vídeo real); la regla debe coincidir con el fixture de paridad.
> - Dependencias: añadir a `training/requirements.txt` `mediapipe` y `opencv-python-headless` con versiones fijadas. Si `mediapipe` no publica paquetes para el Python disponible (3.14), la extracción corre en Docker: `training/Dockerfile` con `python:3.12-slim` y un `docker run -v` que monta `training/`. Documentarlo en `training/README.md`.
>
> **Step 2E: ventanas.** `load_lsc54(root)` lee la caché y convierte cada vídeo (T, 126) en **una** muestra (30, 126):
>
> - si T ≥ 30, la ventana centrada en el tramo con manos;
> - si T < 30, se rellena con ceros (sin manos) repartidos antes y después, como verá la app cuando la persona baja las manos.
>
> El aumento de `train.py` añade un **desplazamiento aleatorio de la ventana** (ya existe `MAX_SHIFT`; subirlo a 6). Los tests de `test_lsc54.py` se reescriben sobre una caché sintética de `.npy`: longitud mayor que 30 → centrada, menor → relleno con ceros, nombre de persona y seña sacados de la ruta. La parte de neutral "otras señas del dataset" usa colores y números de la misma caché.
>
> **Cooldown:** como una seña puede seguir dentro de la ventana hasta 2 s, en la Tarea 8 `createSignClassifier` se crea con `cooldownMs = SEQUENCE_LENGTH * FRAME_INTERVAL_MS` (≈ 2 s) en lugar de 1200.

**Files:**

- Create: `training/senavoz_training/extract.py`, `training/senavoz_training/lsc54.py`, `training/senavoz_training/neutral.py`, `training/senavoz_training/labels.py`
- Modify: `training/senavoz_training/train.py`
- Create: `training/tests/test_extract.py`, `training/tests/test_lsc54.py`, `training/tests/test_neutral.py`
- Modify: `training/requirements.txt` (`mediapipe`, `opencv-python-headless`)
- Modify: `training/tests/test_train.py`

**Interfaces:**

- Consumes: `normalize_frame` (Tarea 4); `FRAME_INTERVAL_MS` y `HAND_HOLD_FRAMES` de `landmarks.ts` (Tarea 3); el modelo `hand_landmarker.task` de la app.
- Produces:
  - `Sample = tuple[str, str, np.ndarray]` (persona, seña, (30, 126) float32).
  - `extract_video(path, landmarker) -> np.ndarray` (T, 126), `hold_missing(seq, frames) -> np.ndarray`, `extract_all(zips_dir, cache_dir) -> None`.
  - `load_lsc54(root: Path) -> list[Sample]`: `root` es la caché de `extract_all`.
  - `SIGN_TO_CODE: dict[str, str]` y `NEUTRAL = "neutral"`.
  - `make_neutral(rng, n_zeros, still_frames, n_still) -> np.ndarray` (N, 30, 126).
  - `train_model(samples, *, val_signers: set[str] | None = None, ...)`: `samples` pasa a ser `list[Sample]`, con el mismo `TrainResult`.
  - `augment(batch, rng)` con espejo y *time-warp* añadidos.

- [ ] **Step 1: Extracción con caché (Step 1E de la enmienda)**

Descargar los tres zips de `RawVideos/` (fileId en `training/FINDINGS.md`) a `training/data/lsc54/RawVideos/`. Escribir primero `training/tests/test_extract.py` (debe fallar con `ModuleNotFoundError`), después `extract.py`, y ejecutar la extracción completa.

Run: `cd training; .venv\Scripts\python -m pytest tests/test_extract.py`
Expected: PASS

Run: `cd training; .venv\Scripts\python -m senavoz_training.extract --zips data/lsc54/RawVideos --cache data/lsc54/cache`
Expected: un `.npy` por vídeo en `data/lsc54/cache/<tema>/<seña>/`. Anotar en `FINDINGS.md` el nº de vídeos procesados y el % de frames sin ninguna mano.

- [ ] **Step 2: Ventanas (Step 2E de la enmienda)**

Tests de `training/tests/test_lsc54.py` sobre una caché sintética de `.npy` (deben fallar primero) y después `lsc54.py` con `SEQUENCE_LENGTH = 30` y `Sample = tuple[str, str, np.ndarray]`.

Run: `cd training; .venv\Scripts\python -m pytest tests/test_lsc54.py`
Expected: PASS

- [ ] **Step 3: Tests que fallan (`neutral` y etiquetas)**

`training/tests/test_neutral.py`:

```python
import numpy as np

from senavoz_training.labels import NEUTRAL, SIGN_TO_CODE
from senavoz_training.neutral import make_neutral


def test_neutral_mixes_zeros_and_still_hands():
    rng = np.random.default_rng(0)
    still = np.ones((5, 126), np.float32)
    out = make_neutral(rng, n_zeros=4, still_frames=still, n_still=6)
    assert out.shape == (10, 30, 126)
    assert sum(not s.any() for s in out) == 4
    moving = out[4:]
    # Mano quieta: todos los frames de una secuencia son casi iguales.
    assert np.abs(moving - moving[:, :1]).max() < 0.1


def test_codes_are_unique_and_not_neutral():
    codes = list(SIGN_TO_CODE.values())
    assert len(codes) == len(set(codes)) and NEUTRAL not in codes
```

- [ ] **Step 4: Implementación de `neutral.py` y `labels.py`**

`training/senavoz_training/neutral.py`:

```python
"""Secuencias de la clase neutral: sin manos y manos quietas."""

import numpy as np

SEQUENCE_LENGTH = 30


def make_neutral(
    rng: np.random.Generator, n_zeros: int, still_frames: np.ndarray, n_still: int
) -> np.ndarray:
    """`still_frames`: frames reales (126,) de los que se forman secuencias quietas con ruido."""
    zeros = np.zeros((n_zeros, SEQUENCE_LENGTH, 126), np.float32)
    picks = still_frames[rng.integers(0, len(still_frames), n_still)]
    still = np.repeat(picks[:, None, :], SEQUENCE_LENGTH, axis=1)
    still += rng.normal(0, 0.01, still.shape).astype(np.float32) * (still != 0)
    return np.concatenate([zeros, still.astype(np.float32)])
```

`training/senavoz_training/labels.py`. El contenido de `SIGN_TO_CODE` sale de FINDINGS.md: solo las señas útiles en una reunión. Los nombres de la izquierda son los del dataset tal cual; los de la derecha, `code` de frase en minúsculas ASCII. Ejemplo con el vocabulario publicado:

```python
"""Señas de LSC-54 que entran en el catálogo de SeñaVoz, con el `code` de su frase."""

NEUTRAL = "neutral"

# Nombre en el dataset → code de la frase (backend/app/services/phrase_service.py).
SIGN_TO_CODE: dict[str, str] = {
    "Hola": "hello",
    "Chao": "bye",
    "Perdón": "sorry",
    "Ayudar": "help",
    "Bien": "good",
    "Mal": "bad",
    "De nada": "welcome",
    "Buenos Días": "good_morning",
}
```

Run: `cd training; .venv\Scripts\python -m pytest tests/test_neutral.py`
Expected: PASS

- [ ] **Step 5: Tests que fallan (validación por persona y aumentos)**

Sustituir `_synthetic` y los tests de `test_train.py` que lo usan para que `train_model` reciba `list[Sample]`:

```python
SIGNERS = [f"S{i}" for i in range(10)]


def _synthetic(seed=0, per_signer=4):
    """Tres clases separables (arriba, abajo, ceros) grabadas por 10 personas."""
    rng = np.random.default_rng(seed)
    out = []
    for s in SIGNERS:
        for _ in range(per_signer):
            up = np.zeros((30, 126), np.float32)
            up[:, :63] = 0.4
            down = np.zeros((30, 126), np.float32)
            down[:, :63] = -0.4
            out.append((s, "yes", up + rng.normal(0, 0.02, up.shape).astype(np.float32)))
            out.append((s, "no", down + rng.normal(0, 0.02, down.shape).astype(np.float32)))
            out.append((s, "neutral", np.zeros((30, 126), np.float32)))
    return out
```

En `test_trains_separable_data`, `samples` vale ahora `{"neutral": 40, "no": 40, "yes": 40}`. `test_needs_two_labels` pasa a `train_model([("S0", "neutral", np.zeros((30, 126), np.float32))])`. Añadir:

```python
def test_validation_uses_unseen_signers():
    result = train_model(_synthetic(), hidden_size=8, max_epochs=2, val_signers={"S0", "S1"})
    assert set(result.metrics["val_signers"]) == {"S0", "S1"}


def test_default_split_holds_out_about_20_percent_of_signers():
    result = train_model(_synthetic(), hidden_size=8, max_epochs=2)
    assert len(result.metrics["val_signers"]) == 2


def test_mirror_swaps_hands_and_negates_x():
    from senavoz_training.train import mirror

    x = np.zeros((1, 30, 126), np.float32)
    x[0, :, 0] = 0.5   # x del primer punto de la mano izquierda
    x[0, :, 1] = 0.25  # y
    m = mirror(x)
    assert m[0, 0, 63] == -0.5 and m[0, 0, 64] == 0.25 and not m[0, :, :63].any()


def test_time_warp_keeps_shape():
    from senavoz_training.train import time_warp

    rng = np.random.default_rng(0)
    x = np.arange(30 * 126, dtype=np.float32).reshape(1, 30, 126)
    assert time_warp(x, rng).shape == (1, 30, 126)
```

Run: `cd training; .venv\Scripts\python -m pytest tests/test_train.py`
Expected: FAIL

- [ ] **Step 6: Implementación en `train.py`**

Sustituir `_split` por una división por persona y añadir los aumentos:

```python
VAL_SIGNER_FRACTION = 0.2
MAX_WARP = 0.2

Sample = tuple[str, str, np.ndarray]


def _split(samples: list[Sample], labels: list[str], val_signers: set[str]):
    index = {label: k for k, label in enumerate(labels)}
    tr = [(x, index[l]) for s, l, x in samples if s not in val_signers]
    va = [(x, index[l]) for s, l, x in samples if s in val_signers]
    stack = lambda part: (  # noqa: E731
        np.stack([x for x, _ in part]).astype(np.float32),
        np.array([y for _, y in part], np.int64),
    )
    return (*stack(tr), *stack(va))


def mirror(batch: np.ndarray) -> np.ndarray:
    """Intercambia las manos y niega x: la misma seña hecha con la otra mano."""
    out = np.concatenate([batch[..., 63:], batch[..., :63]], axis=-1).copy()
    out[..., 0::3] *= -1
    return out


def time_warp(batch: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Cambia la velocidad de cada secuencia ±20 %: más lenta repite frames, más rápida
    termina antes y mantiene el último frame (como una ventana que sigue tras la seña)."""
    out = np.empty_like(batch)
    n = batch.shape[1]
    for i in range(len(batch)):
        f = rng.uniform(1 - MAX_WARP, 1 + MAX_WARP)
        src = np.clip(np.round(np.arange(n) * f), 0, n - 1).astype(int)
        out[i] = batch[i, src]
    return out
```

En `augment`, antes del bucle de desplazamiento:

```python
    flip = rng.random(len(out)) < 0.5
    out[flip] = mirror(out[flip])
    out = time_warp(out, rng)
```

En `train_model`, la firma pasa a `train_model(samples: list[Sample], *, val_signers: set[str] | None = None, ...)` y el inicio queda así:

```python
    labels = sorted({label for _, label, _ in samples})
    if len(labels) < 2:
        raise ValueError("Se necesitan al menos dos etiquetas para entrenar")
    rng = np.random.default_rng(seed)
    torch.manual_seed(seed)
    signers = sorted({s for s, _, _ in samples})
    if val_signers is None:
        n_val = max(1, round(len(signers) * VAL_SIGNER_FRACTION))
        val_signers = set(rng.permutation(signers)[:n_val].tolist())
    x_tr, y_tr, x_va, y_va = _split(samples, labels, val_signers)
```

y las métricas:

```python
    metrics = {
        "val_accuracy": round(float((pred == y_va).mean()), 4),
        "per_label": per_label,
        "samples": {label: sum(1 for _, l, _ in samples if l == label) for label in labels},
        "val_signers": sorted(val_signers),
    }
```

Run: `cd training; .venv\Scripts\python -m pytest`
Expected: PASS

- [ ] **Step 7: Commit (lo ejecuta el usuario)**

Se entrega junto con las Tareas 4 y 7.

---

### Task 6: CLI `build` y generación de `sign-model.json`

**Files:**

- Create: `training/senavoz_training/build.py`
- Create: `training/tests/test_build.py`
- Create: `desktop/src/renderer/src/assets/sign-model.json` (salida)
- Create: `training/README.md`

**Interfaces:**

- Consumes: `load_lsc54`, `make_neutral`, `SIGN_TO_CODE`, `NEUTRAL`, `train_model`.
- Produces:
  - `build_model(samples: list[Sample], *, min_accuracy=0.8, seed=0, **train_kwargs) -> dict | None`: JSON listo para la app, o None si quedan menos de 2 señas.
  - Campos del JSON: los de `senavoz-gru-v1` más `metrics: {val_accuracy, per_label}` y `source: str`. `labels` usa los `code` de frase más `neutral`.

- [ ] **Step 1: Tests que fallan**

`training/tests/test_build.py`:

```python
import numpy as np

from senavoz_training.build import SOURCE, build_model, round_sig


def _samples():
    rng = np.random.default_rng(0)
    out = []
    for s in [f"S{i}" for i in range(10)]:
        for _ in range(4):
            up = np.zeros((30, 126), np.float32)
            up[:, :63] = 0.4
            out.append((s, "hello", up + rng.normal(0, 0.02, up.shape).astype(np.float32)))
            down = np.zeros((30, 126), np.float32)
            down[:, :63] = -0.4
            out.append((s, "bye", down + rng.normal(0, 0.02, down.shape).astype(np.float32)))
            noisy = rng.normal(0, 1, (30, 126)).astype(np.float32)  # imposible de aprender
            out.append((s, "sorry", noisy))
            out.append((s, "neutral", np.zeros((30, 126), np.float32)))
    return out


def test_keeps_only_signs_above_threshold():
    model = build_model(_samples(), hidden_size=16, max_epochs=40)
    assert model is not None
    assert "sorry" not in model["labels"]
    assert {"hello", "bye", "neutral"} <= set(model["labels"])
    assert model["source"] == SOURCE
    assert all(v >= 0.8 for k, v in model["metrics"]["per_label"].items() if k != "neutral")


def test_none_when_fewer_than_two_signs_pass():
    rng = np.random.default_rng(1)
    noisy = [(f"S{i}", lbl, rng.normal(0, 1, (30, 126)).astype(np.float32))
             for i in range(10) for lbl in ("hello", "bye", "neutral") for _ in range(3)]
    assert build_model(noisy, hidden_size=8, max_epochs=3) is None


def test_round_sig():
    assert round_sig(0.123456789) == 0.123457
    assert round_sig(-1234567.0) == -1234570.0
    assert round_sig(0.0) == 0.0
```

Run: `cd training; .venv\Scripts\python -m pytest tests/test_build.py`
Expected: FAIL

- [ ] **Step 2: Implementación**

`training/senavoz_training/build.py`:

```python
"""Genera el modelo global de SeñaVoz a partir de LSC-54.

Uso (desde training/):
  python -m senavoz_training.build --data data/lsc54/cache [--dry-run]
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np

from senavoz_training.labels import NEUTRAL, SIGN_TO_CODE
from senavoz_training.lsc54 import Sample, load_lsc54
from senavoz_training.neutral import make_neutral
from senavoz_training.train import train_model

OUT = Path(__file__).resolve().parents[2] / "desktop/src/renderer/src/assets/sign-model.json"
SOURCE = (
    "LSC-54 (Mora-Zarate, Garzón-Castro y Castellanos-Rivillas, Data in Brief 63, 112145, "
    "2025; DOI 10.57760/sciencedb.25639), CC BY-NC 4.0"
)


def round_sig(v: float, digits: int = 6) -> float:
    return 0.0 if v == 0 else round(v, digits - 1 - int(math.floor(math.log10(abs(v)))))


def _round(obj):
    if isinstance(obj, float):
        return round_sig(obj)
    if isinstance(obj, list):
        return [_round(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    return obj


def build_model(samples: list[Sample], *, min_accuracy: float = 0.8, seed: int = 0, **kw):
    """Entrena, descarta (pasa a neutral) las señas < min_accuracy y reentrena con las demás."""
    current = samples
    for _ in range(5):
        if len({l for _, l, _ in current} - {NEUTRAL}) < 2:
            return None  # quedan menos de 2 señas: no hay modelo útil
        result = train_model(current, seed=seed, **kw)
        weak = {l for l, acc in result.metrics["per_label"].items()
                if l != NEUTRAL and acc < min_accuracy}
        if not weak:
            break
        current = [(s, NEUTRAL if l in weak else l, x) for s, l, x in current]
    signs = [l for l in result.weights["labels"] if l != NEUTRAL]
    if weak or len(signs) < 2:
        return None
    return _round({
        **result.weights,
        "metrics": {k: result.metrics[k] for k in ("val_accuracy", "per_label")},
        "source": SOURCE,
    })


def dataset_samples(root: Path, seed: int = 0) -> list[Sample]:
    raw = load_lsc54(root)
    rng = np.random.default_rng(seed)
    kept = [(s, SIGN_TO_CODE[n], x) for s, n, x in raw if n in SIGN_TO_CODE]
    others = [(s, NEUTRAL, x) for s, n, x in raw if n not in SIGN_TO_CODE]
    signers = sorted({s for s, _, _ in raw})
    per_signer = max(1, len(kept) // max(1, len(SIGN_TO_CODE)) // len(signers))
    still_src = np.concatenate([x for _, _, x in kept])
    still_src = still_src[still_src.any(axis=1)]
    synth = []
    for s in signers:
        for seq in make_neutral(rng, per_signer, still_src, per_signer):
            synth.append((s, NEUTRAL, seq))
    return kept + others + synth


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--data", type=Path, required=True)
    p.add_argument("--dry-run", action="store_true", help="solo imprime métricas")
    args = p.parse_args()
    samples = dataset_samples(args.data)
    model = build_model(samples)
    if model is None:
        print("Menos de 2 señas superan el umbral: no se escribe el modelo.")
        raise SystemExit(1)
    print(json.dumps(model["metrics"], indent=1, ensure_ascii=False))
    if not args.dry_run:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
        print(f"Modelo escrito en {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
```

Run: `cd training; .venv\Scripts\python -m pytest`
Expected: PASS

- [ ] **Step 3: Volver a la Tarea 1, Step 4**

Run: `cd training; .venv\Scripts\python -m senavoz_training.build --data data/lsc54/cache --dry-run`

Anotar en FINDINGS.md la precisión por seña y aplicar el criterio para seguir. Si alguna seña de `SIGN_TO_CODE` queda descartada, quitarla de `labels.py` para que el catálogo no la anuncie.

- [ ] **Step 4: Generar el modelo**

Run: `cd training; .venv\Scripts\python -m senavoz_training.build --data data/lsc54/cache`
Expected: `Modelo escrito en ...sign-model.json (≈ 300–400 KB)`. Comprobar que todas las etiquetas salvo `neutral` están en `SIGN_TO_CODE.values()`.

- [ ] **Step 5: `training/README.md`**

```markdown
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
```

- [ ] **Step 6: Commit (lo ejecuta el usuario)**

Se entrega junto con las Tareas 4, 5 y 7 (ver el bloque de la Tarea 7).

---

### Task 7: Backend sin muestras, modelos ni trainer; frases nuevas

**Files:**

- Delete: `backend/app/api/samples.py`, `backend/app/api/models.py`, `backend/app/schemas/samples.py`, `backend/app/services/sample_service.py`, `backend/app/services/model_service.py`, `backend/app/training/` (lo que quede), `backend/requirements-train.txt`, `backend/tests/test_samples.py`, `backend/tests/test_models_api.py`, `backend/tests/test_worker.py`
- Create: `backend/alembic/versions/0004_drop_sign_tables.py`
- Modify: `backend/app/main.py`, `backend/app/db/models.py`, `backend/app/core/config.py`, `backend/app/services/phrase_service.py`, `backend/tests/conftest.py`, `backend/tests/test_phrases.py`, `backend/Dockerfile`, `backend/requirements-dev.txt`, `docker-compose.yml`

**Interfaces:**

- Consumes: `SIGN_TO_CODE` (Tarea 5), con las señas que pasaron en la Tarea 6.
- Produces: `DEFAULT_PHRASES` con las 9 frases actuales seguidas de una por cada `code` de `SIGN_TO_CODE`; la API sin `/samples` ni `/models`.

- [ ] **Step 1: Tests que fallan**

En `backend/tests/test_phrases.py` añadir:

```python
def test_removed_endpoints_are_gone(client, tokens):
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    assert client.get("/samples/summary", headers=auth).status_code == 404
    assert client.get("/models/status", headers=auth).status_code == 404


def test_seed_includes_sign_phrases():
    codes = {c for c, _ in DEFAULT_PHRASES}
    # Deben coincidir con training/senavoz_training/labels.py (SIGN_TO_CODE.values()).
    assert {"hello", "bye", "sorry", "help", "good", "bad", "welcome", "good_morning"} <= codes
```

Usar en este conjunto **exactamente** los `code` que quedaron en `labels.py` tras la Tarea 6.

Run: `cd backend; pytest tests/test_phrases.py`
Expected: FAIL

- [ ] **Step 2: Borrar código y quitarlo de la app**

```powershell
git rm -r backend/app/api/samples.py backend/app/api/models.py backend/app/schemas/samples.py backend/app/services/sample_service.py backend/app/services/model_service.py backend/app/training backend/requirements-train.txt backend/tests/test_samples.py backend/tests/test_models_api.py backend/tests/test_worker.py
```

(`model.py`, `train.py` y `test_training.py` ya se movieron en la Tarea 4.)

- `backend/app/main.py`: `from app.api import auth, health, phrases, users` y `routers = (health, auth, users, phrases)`.
- `backend/app/core/config.py`: borrar `rate_limit_samples` y `rate_limit_train`.
- `backend/app/db/models.py`: borrar las clases `SignSample` y `SignModel`, las dos relaciones `sign_samples`/`sign_models` de `User` (con su comentario) y las importaciones que queden sin uso (`JSON`, `Index`, `LargeBinary`, `Text`, `text`, `relationship` si ya no se usan).
- `backend/tests/conftest.py`: borrar el fixture que usa `SignSample` (líneas ~85–92) y todo lo que solo usaban los tests eliminados.
- `backend/requirements-dev.txt`: quitar la línea `-r requirements-train.txt`.

- [ ] **Step 3: Frases nuevas**

En `phrase_service.py`, añadir al final de `DEFAULT_PHRASES` (mismos `code` que `labels.py`, textos para una reunión):

```python
    # Frases con seña en el modelo global (training/senavoz_training/labels.py).
    ("hello", "Hola"),
    ("bye", "Hasta luego"),
    ("sorry", "Perdón"),
    ("help", "Necesito ayuda"),
    ("good", "Bien"),
    ("bad", "Mal"),
    ("welcome", "De nada"),
    ("good_morning", "Buenos días"),
```

Dejar solo las que estén en `labels.py`.

- [ ] **Step 4: Migración `0004`**

`backend/alembic/versions/0004_drop_sign_tables.py`:

```python
"""elimina sign_samples y sign_models (el modelo de señas es global y va en la app)

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-14
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_ACTIVE = sa.text("status IN ('queued', 'training')")


def upgrade() -> None:
    op.drop_table("sign_models")
    op.drop_table("sign_samples")


def downgrade() -> None:
    op.create_table(
        "sign_samples",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sign_samples_user_id", "sign_samples", ["user_id"])
    op.create_index("ix_sign_samples_user_label", "sign_samples", ["user_id", "label"])
    op.create_table(
        "sign_models",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("labels", sa.JSON(), nullable=False),
        sa.Column("weights", sa.JSON(), nullable=True),
        sa.Column("metrics", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sign_models_user_id", "sign_models", ["user_id"])
    op.create_index("ix_sign_models_status", "sign_models", ["status"])
    op.create_index(
        "uq_sign_models_user_active",
        "sign_models",
        ["user_id"],
        unique=True,
        postgresql_where=_ACTIVE,
        sqlite_where=_ACTIVE,
    )
```

- [ ] **Step 5: Docker**

`backend/Dockerfile` vuelve a un único objetivo:

```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN chmod +x scripts/entrypoint.sh
EXPOSE 8000
CMD ["scripts/entrypoint.sh"]
```

`docker-compose.yml`: borrar el servicio `trainer` completo y la línea `target: api` del servicio `api`.

- [ ] **Step 6: Comprobar**

Run: `cd backend; pytest`
Expected: PASS (los tests de auth, CORS y frases, más los 2 nuevos).

Run: `docker compose up --build -d; docker compose logs api --tail 30`
Expected: `Running upgrade 0003 -> 0004` sin errores, el seed crea las frases nuevas y `GET http://localhost:8000/health` → `{"status":"ok"}`. Después: `docker compose exec api alembic downgrade 0003; docker compose exec api alembic upgrade head` sin errores, y por último `docker compose down`.

- [ ] **Step 7: Commits (los ejecuta el usuario)**

Las Tareas 4–7 se entregan como dos commits:

```powershell
git add .gitignore training/
git commit -m "feat(training): entrenamiento offline del modelo LSC global con LSC-54" -m "Carpeta training/ fuera del backend desplegado: normalización idéntica a la app (fixture de paridad), lectura de LSC-54, clase neutral, validación con personas no vistas, aumentos por espejo y time-warp, y CLI que exporta solo las señas con al menos un 80 % de acierto." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

git add -A backend docker-compose.yml
git commit -m "refactor(backend): quitar muestras, modelos por usuario y servicio trainer" -m "Elimina /samples, /models, el worker y PyTorch de la imagen; la migración 0004 borra sign_samples y sign_models. El seed añade las frases con seña del modelo global." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: App con el modelo empaquetado, sin Entrenar

**Files:**

- Modify: `desktop/src/renderer/src/store/signModel.ts` (reescrito)
- Modify: `desktop/src/renderer/src/__tests__/signModel.test.ts` (reescrito)
- Modify: `desktop/src/renderer/src/hooks/useSignRecognition.ts`
- Modify: `desktop/src/renderer/src/routes/Camera.tsx`, `routes/Meeting.tsx`, `routes/AppLayout.tsx`, `routes/Settings.tsx`, `App.tsx`
- Modify: `desktop/src/renderer/src/api/endpoints.ts`, `api/types.ts`, `i18n/es.ts`, `ui/icons.tsx`
- Modify: `desktop/src/renderer/src/__tests__/cameraScreen.test.tsx`, `__tests__/settings.test.tsx`, `__tests__/meetingScreen.test.tsx`
- Delete: `routes/Train.tsx`, `routes/train.module.css`, `routes/settings/TrainingDataSection.tsx`, `services/training/`, `__tests__/trainScreen.test.tsx`

**Interfaces:**

- Consumes: `sign-model.json` (Tarea 6), `GruModel.fromJson`, `createSignClassifier`.
- Produces:
  - `useSignModel`: `{ status: 'loading' | 'ready' | 'error'; classifier: SignClassifier | null; labels: string[]; valAccuracy: number | null; load(loader?: () => Promise<unknown>): Promise<void> }`.
  - `signLabels(state): string[]` (etiquetas sin `neutral`), que usa la Tarea 9.
  - `modelStatusText({ status, labels }): string`

- [ ] **Step 1: Tests que fallan (store)**

Sustituir `__tests__/signModel.test.ts` por:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { signLabels, useSignModel } from '@/store/signModel';

function weights(labels: string[], bias: number[]) {
  const row = (n: number) => Array<number>(n).fill(0);
  return {
    format: 'senavoz-gru-v1',
    input_size: 126,
    hidden_size: 1,
    labels,
    gru: {
      weight_ih: [row(126), row(126), row(126)],
      weight_hh: [[0], [0], [0]],
      bias_ih: row(3),
      bias_hh: row(3),
    },
    head: { weight: labels.map(() => [0]), bias },
    metrics: { val_accuracy: 0.91, per_label: {} },
  };
}
const SEQ = Array<number>(3780).fill(0);

beforeEach(() => useSignModel.setState({ status: 'loading', classifier: null, labels: [], valAccuracy: null }));

describe('useSignModel (modelo empaquetado)', () => {
  it('carga el modelo y clasifica sin red', async () => {
    await useSignModel.getState().load(async () => weights(['hello', 'neutral'], [5, 0]));
    const s = useSignModel.getState();
    expect(s.status).toBe('ready');
    expect(s.valAccuracy).toBe(0.91);
    expect(signLabels(s)).toEqual(['hello']);
    expect(await s.classifier!.classify(SEQ)).toMatchObject({ code: 'hello' });
  });

  it('neutral nunca produce frase', async () => {
    await useSignModel.getState().load(async () => weights(['hello', 'neutral'], [0, 5]));
    expect(await useSignModel.getState().classifier!.classify(SEQ)).toBeNull();
  });

  it('un JSON inválido deja el estado en error sin clasificador', async () => {
    await useSignModel.getState().load(async () => ({ format: 'otro' }));
    expect(useSignModel.getState()).toMatchObject({ status: 'error', classifier: null });
  });

  it('un fallo al importar también deja el estado en error', async () => {
    await useSignModel.getState().load(async () => {
      throw new Error('chunk');
    });
    expect(useSignModel.getState().status).toBe('error');
  });
});
```

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/__tests__/signModel.test.ts`
Expected: FAIL

- [ ] **Step 2: Store nuevo**

Sustituir `store/signModel.ts`:

```ts
import { create } from 'zustand';

import { GruModel } from '@/services/recognition/GruModel';
import { createSignClassifier, type SignClassifier } from '@/services/recognition/SignClassifier';

const NEUTRAL = 'neutral';

type SignModelState = {
  status: 'loading' | 'ready' | 'error';
  classifier: SignClassifier | null;
  labels: string[];
  valAccuracy: number | null;
  load: (loader?: () => Promise<unknown>) => Promise<void>;
};

// Import dinámico: el JSON (≈ 300 KB) no retrasa el primer render.
const bundledModel = () => import('@/assets/sign-model.json').then((m) => m.default as unknown);

/** Etiquetas que producen frase (todas salvo neutral). */
export const signLabels = (s: Pick<SignModelState, 'labels'>): string[] =>
  s.labels.filter((l) => l !== NEUTRAL);

/** Modelo LSC global, empaquetado con la app: se carga una vez, sin red ni sesión. */
export const useSignModel = create<SignModelState>()((set) => ({
  status: 'loading',
  classifier: null,
  labels: [],
  valAccuracy: null,
  async load(loader = bundledModel) {
    try {
      const json = await loader();
      const model = GruModel.fromJson(json);
      // Las etiquetas son los `code` de las frases; `neutral` no está en el mapa.
      const labelToCode = Object.fromEntries(
        model.labels.filter((l) => l !== NEUTRAL).map((l) => [l, l]),
      );
      const acc = (json as { metrics?: { val_accuracy?: unknown } }).metrics?.val_accuracy;
      set({
        status: 'ready',
        classifier: createSignClassifier(model, labelToCode),
        labels: [...model.labels],
        valAccuracy: typeof acc === 'number' ? acc : null,
      });
    } catch {
      set({ status: 'error', classifier: null, labels: [], valAccuracy: null });
    }
  },
}));
```

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/__tests__/signModel.test.ts`
Expected: PASS

- [ ] **Step 3: Quitar Entrenar y la API de muestras y modelos**

```powershell
cd desktop/src/renderer/src
git rm routes/Train.tsx routes/train.module.css routes/settings/TrainingDataSection.tsx __tests__/trainScreen.test.tsx
git rm -r services/training
```

- `App.tsx`: borrar `import Train ...` y `<Route path="/entrenar" ... />`.
- `routes/AppLayout.tsx`:
  - borrar la entrada `/entrenar` de `links` y `IconTrain` de la importación;
  - cambiar el `useEffect` por `useEffect(() => { void useSignModel.getState().load(); }, []);` con el comentario `// El modelo va empaquetado: se carga una vez al entrar.`
- `ui/icons.tsx`: borrar `IconTrain`.
- `routes/Settings.tsx`: borrar la importación y `<TrainingDataSection />`.
- `api/endpoints.ts`: borrar `SAMPLES_KEY`, `samplesApi` y `modelsApi`, y dejar `import type { Phrase, TokenPair, User } from './types';`.
- `api/types.ts`: borrar `SampleSummary`, `ModelMetrics`, `ReadyModel`, `ModelJob` y `ModelStatus`.

- [ ] **Step 4: Hook y pantallas**

En `hooks/useSignRecognition.ts`:

- quitar `isTraining`, `SignRecognitionOptions`, `classify`, `onFrame`, `onFrameRef`, `unsubscribeFrame` y la importación de `LandmarkFrame`. La firma pasa a `useSignRecognition(videoRef, onSign)` y el clasificador es `useSignModel((s) => s.classifier)`;
- sustituir `modelStatusText` y `ModelView` por:

```ts
type ModelView = { status: 'loading' | 'ready' | 'error'; labels: string[] };

/** Texto del estado del modelo de señas para los paneles de Cámara y Reunión. */
export function modelStatusText(model: ModelView): string {
  if (model.status === 'ready') return t('camera.modelReady', { n: String(signLabels(model).length) });
  if (model.status === 'error') return t('camera.modelError');
  return t('camera.modelLoading');
}
```

- en `visionMessageKey`, `!recognition.modelAvailable` pasa a devolver `'camera.modelError'` (sin modelo solo puede ser por error).

En `routes/Camera.tsx` y `routes/Meeting.tsx`:

- `useShallow((s) => ({ status: s.status, labels: s.labels }))`;
- en Camera, borrar `isTraining`, `training`, `Link` y el bloque `{ready && !modelReady && !training ? (...warnPanel...) : null}`.

En `i18n/es.ts`:

- borrar `nav.train`, todas las `train.*`, `settings.trainingData*`, `settings.deleteTrainingData`, `settings.confirmDeleteTrainingData`, `camera.modelUnavailable`, `camera.handsWithoutModel`, `camera.modelNo`, `camera.modelTraining`, `camera.noModelTitle`, `camera.noModelBody` y `camera.toPhrases` (si solo se usaba ahí);
- cambiar y añadir:

```ts
  'camera.modelReady': 'Modelo LSC · {n} señas',
  'camera.modelLoading': 'Cargando modelo…',
  'camera.modelError': 'Reconocimiento de señas no disponible',
```

- [ ] **Step 5: Ajustar los tests de pantallas**

- `__tests__/cameraScreen.test.tsx`: sustituir `useSignModel.getState().clear(); useSignModel.setState({ status: 'none' })` por `useSignModel.setState({ status: 'error', classifier: null, labels: [], valAccuracy: null })`. Los tests que fijaban `metrics`/`job` pasan a `{ status: 'ready', labels: ['hello', 'neutral'] }`, y esperan `'Modelo LSC · 1 señas'`. Borrar los tests del aviso "Aún no tienes un modelo" y del enlace a Entrenar. Añadir:

```tsx
  it('con el modelo en error, la cámara avisa y no hay enlace a Entrenar', async () => {
    useSignModel.setState({ status: 'error', classifier: null, labels: [], valAccuracy: null });
    renderCamera();
    expect(await screen.findByText('Reconocimiento de señas no disponible')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /entrenar/i })).toBeNull();
  });
```

  (`renderCamera` es el helper de render ya existente en ese archivo; si se llama distinto, usar el existente.)
- `__tests__/settings.test.tsx`: borrar la importación de `modelsApi`/`samplesApi`, el `vi.spyOn(modelsApi, 'status')` y los tests de "Borrar todos mis datos de entrenamiento".
- `__tests__/meetingScreen.test.tsx`: sustituir cualquier `useSignModel.setState` con `metrics`/`job` por la forma nueva.

- [ ] **Step 6: Comprobar todo**

Run: `cd desktop; npm test; npm run typecheck; npm run lint`
Expected: todo PASS, sin errores de tipos ni de lint. Si `typecheck` no resuelve `@/assets/sign-model.json`, comprobar que el archivo existe (Tarea 6). `resolveJsonModule` ya viene activado en `@electron-toolkit/tsconfig`.

- [ ] **Step 7: Commit (lo ejecuta el usuario)**

```powershell
git add -A desktop/src
git commit -m "feat(desktop): modelo LSC global empaquetado y sin pantalla Entrenar" -m "La app carga sign-model.json al arrancar, sin red ni pasos previos. Ventana de 30 frames a intervalo fijo, mano perdida mantenida unos frames y sin inferencia cuando no hay manos. Se eliminan la pantalla Entrenar, la sección de datos de entrenamiento y la API de muestras y modelos." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Distintivo "Seña" en Frases y créditos en Ajustes

**Files:**

- Modify: `desktop/src/renderer/src/ui/PhraseCard.tsx`, `ui/ui.module.css`, `routes/Phrases.tsx`, `routes/Settings.tsx`, `i18n/es.ts`
- Modify: `desktop/src/renderer/src/__tests__/phrases.test.tsx`, `__tests__/settings.test.tsx`

**Interfaces:**

- Consumes: `useSignModel`, `signLabels` (Tarea 8).
- Produces: `PhraseCard` con la prop opcional `hasSign?: boolean`.

- [ ] **Step 1: Tests que fallan**

En `__tests__/phrases.test.tsx` añadir (usando el render y los datos de frases existentes del archivo; si el mock de frases no tiene `yes`, usar un `code` que sí tenga):

```tsx
  it('marca con "Seña" solo las frases que el modelo reconoce', async () => {
    useSignModel.setState({ status: 'ready', classifier: null, labels: ['yes', 'neutral'], valAccuracy: 0.9 });
    renderPhrases();
    const yes = await screen.findByRole('button', { name: /Sí/ });
    expect(within(yes).getByText('Seña')).toBeInTheDocument();
    const no = screen.getByRole('button', { name: /^Decir No/ });
    expect(within(no).queryByText('Seña')).toBeNull();
  });
```

En `__tests__/settings.test.tsx`:

```tsx
  it('muestra la atribución de LSC-54', async () => {
    renderSettings();
    expect(await screen.findByText(/LSC-54/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY-NC 4\.0/)).toBeInTheDocument();
  });
```

(Ajustar `renderPhrases`/`renderSettings` y la etiqueta accesible del botón de "No" a los helpers y textos reales del archivo.)

Run: `cd desktop; npx vitest run --project renderer src/renderer/src/__tests__/phrases.test.tsx src/renderer/src/__tests__/settings.test.tsx`
Expected: FAIL

- [ ] **Step 2: Implementación**

`ui/PhraseCard.tsx`: añadir `hasSign?: boolean` a `Props` y, después de `<span className={styles.cardText}>{text}</span>`:

```tsx
      {hasSign ? <span className={styles.signBadge}>{t('home.hasSign')}</span> : null}
```

`ui/ui.module.css`: reutilizar los tokens existentes del archivo (tomar como referencia los de `.shortcut`) para el color y el tamaño:

```css
.signBadge {
  justify-self: start;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
  opacity: 0.8;
}
```

`routes/Phrases.tsx`:

```tsx
  const signs = useSignModel(useShallow((s) => signLabels(s)));
  ...
            <PhraseCard
              ...
              hasSign={signs.includes(p.code)}
            />
```

(con `import { useShallow } from 'zustand/react/shallow';` e `import { signLabels, useSignModel } from '@/store/signModel';`)

`routes/Settings.tsx`, antes de la sección de perfil:

```tsx
      <section className={styles.section} aria-label={t('settings.creditsTitle')}>
        <h2 className={styles.sectionTitle}>{t('settings.creditsTitle')}</h2>
        <p className={styles.muted}>{t('settings.credits')}</p>
      </section>
```

`i18n/es.ts`:

```ts
  'home.hasSign': 'Seña',
  'settings.creditsTitle': 'Créditos',
  'settings.credits':
    'Reconocimiento de señas entrenado con LSC-54 (Mora-Zarate, Garzón-Castro y Castellanos-Rivillas, Universidad de La Sabana, 2025), licencia CC BY-NC 4.0.',
```

- [ ] **Step 3: Comprobar**

Run: `cd desktop; npm test; npm run typecheck; npm run lint`
Expected: PASS

- [ ] **Step 4: Commit (lo ejecuta el usuario)**

```powershell
git add desktop/src/renderer/src
git commit -m "feat(desktop): distintivo Seña en las frases reconocibles y créditos de LSC-54" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Documentación y verificación final

**Files:**

- Modify: `README.md`, `docs/ARCHITECTURE.md`, `docs/superpowers/specs/2026-10-07-trained-sign-model-design.md`

- [ ] **Step 1: README**

- Introducción: "Reconoce señas de la Lengua de Señas Colombiana con un modelo incluido en la app (sin entrenar nada)".
- Árbol: añadir `training/   # entrenamiento offline del modelo de señas (no se despliega)`.
- Backend: `docker compose up --build` levanta `db` y `api`; quitar el párrafo del trainer y la mención a la imagen sin PyTorch.
- Endpoints: borrar las filas de `/samples` y `/models`, y la frase sobre los límites de `POST /samples` y `POST /models/train`.
- Uso:
  - quitar el paso 4 (Entrenar);
  - el paso 3 (Cámara) dice que las frases marcadas con "Seña" se reconocen al hacerlas;
  - el paso 5 (Ajustes) ya no tiene "Borrar mis datos de entrenamiento" y añade "Créditos".
- Seguridad: cambiar la viñeta de muestras por "La app no envía vídeo ni landmarks a ningún servidor: el modelo va dentro de la app".
- Tests:
  - actualizar los recuentos con los números reales de `pytest` y `npm test`;
  - añadir la línea **Training** (`cd training; .venv\Scripts\python -m pytest`).
- Qué se verificó: añadir la entrada del 14/10/2026 con lo comprobado en el Step 4. Pasar a "No verificado" lo que no se pruebe con webcam real.
- Nueva sección **Datos y licencia**, con la atribución completa de LSC-54 y un enlace a `training/README.md`.

- [ ] **Step 2: ARCHITECTURE**

- Diagrama: quitar `Trainer` y las flechas de muestras y pesos con el backend; añadir `sign-model.json (empaquetado)` → `Rec`.
- Modelo de datos: "Migración `0004` elimina `sign_samples` y `sign_models`"; borrar sus tablas.
- Sustituir la decisión **Datos y modelo de señas** por: modelo global LSC entrenado offline con LSC-54 en `training/`, empaquetado, misma normalización verificada por fixture, validación por persona, clase `neutral` sintética, catálogo mixto; spec `2026-10-14-global-sign-model-design.md`.
- **Visión local**: "La ventana son 30 frames tomados cada `FRAME_INTERVAL_MS`; sin manos en la ventana no se ejecuta el modelo."
- Roadmap: "Modelo de señas global — hecho" y marcar como sustituido el modelo por usuario.

- [ ] **Step 3: Aviso en la spec antigua**

Primera línea tras el título de `2026-10-07-trained-sign-model-design.md`:

```markdown
> **Sustituida** el 2026-10-14 por `2026-10-14-global-sign-model-design.md`: ya no hay entrenamiento por usuario.
```

- [ ] **Step 4: Verificación completa**

Run: `cd backend; pytest` → PASS
Run: `cd training; .venv\Scripts\python -m pytest` → PASS
Run: `cd desktop; npm test; npm run typecheck; npm run lint` → PASS
Run: `docker compose up --build -d` y luego `cd desktop; npm run dev`:

- registrarse o iniciar sesión, sin pasos previos;
- Frases muestra "Seña" en las frases del modelo;
- en Cámara, el panel dice "Modelo LSC · N señas";
- ya no aparece Entrenar en la barra lateral ni la sección de datos de entrenamiento en Ajustes; Créditos sí;
- con las manos bajadas no se dice nada.

**Manual (el usuario, webcam real):** hacer cada seña incluida siguiendo el vídeo de referencia del diccionario del INSOR o de LSC-54, en Cámara y en Modo reunión, y anotar cuáles se reconocen. Ese resultado va a "Qué se verificó" del README.

Run: `cd desktop; npm run build:win` → genera el instalador. Anotar el tamaño de `app.asar` en el README.

- [ ] **Step 5: Commit (lo ejecuta el usuario)**

```powershell
git add README.md docs/ARCHITECTURE.md docs/superpowers/specs/2026-10-07-trained-sign-model-design.md docs/superpowers/plans/2026-10-14-global-sign-model.md
git commit -m "docs: modelo LSC global en README, arquitectura y specs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
