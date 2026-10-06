# Reconocimiento real de señas — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Añadir detección local de manos con MediaPipe y conectar el flujo de predicción de señas sin simular resultados ni afirmar reconocimiento semántico sin un modelo entrenado.

**Architecture:** El renderer crea un reconocedor para el elemento de vídeo de la cámara. MediaPipe procesa vídeo en modo VIDEO y produce landmarks normalizados; un clasificador opcional consume la secuencia y entrega código/confianza al contrato existente. Si no hay artefacto de modelo compatible, la pantalla informa claramente que solo está disponible la detección de manos.

**Tech Stack:** Electron 44, React 19, TypeScript, `@mediapipe/tasks-vision`, Vitest/Testing Library ya existentes.

**Spec:** `docs/superpowers/specs/2026-10-06-real-sign-recognition-design.md`

## Global Constraints

- La inferencia ocurre localmente en el renderer; no se transmiten vídeo ni landmarks al backend.
- Mantener el contrato `SignRecognizer` para aislar la UI de la implementación.
- No emitir predicciones si no existe un clasificador/modelo cargado y compatible.
- Los recursos de MediaPipe y el ciclo de frames se liberan al detenerse o desmontar la pantalla.
- Solo códigos que existan en el catálogo de frases pueden activar voz.

## Review Focus

- La cámara inicia antes de que el vídeo tenga dimensiones: no procesar hasta `readyState` y dimensiones válidas.
- No hay modelo, WASM o modelo de MediaPipe no disponible: mostrar estado informativo sin clasificarlo como error de cámara.
- El usuario cambia cámara o sale de la vista con un callback de frame pendiente: detener el loop y cerrar el detector una sola vez.
- Mano ausente, una mano o dos manos: producir un vector estable de 126 valores con ceros para mano ausente.
- Predicciones repetidas o códigos ajenos al catálogo: respetar cooldown y no hablar códigos desconocidos.

## Mapa de archivos

- `desktop/package.json` — dependencia de MediaPipe.
- `desktop/src/renderer/src/services/recognition/SignRecognizer.ts` — contrato y estado de reconocimiento/predicción.
- `desktop/src/renderer/src/services/recognition/landmarks.ts` — transformación de landmarks a coordenadas normalizadas y secuencias temporales.
- `desktop/src/renderer/src/services/recognition/MediaPipeSignRecognizer.ts` — creación del Hand Landmarker, ciclo de frames y clasificador opcional.
- `desktop/src/renderer/src/routes/Camera.tsx` — pasar vídeo al reconocedor, presentar estados y filtrar códigos según catálogo.
- `desktop/src/renderer/src/i18n/es.ts` — textos de carga, búsqueda de manos y modelo ausente.
- `desktop/src/renderer/src/routes/routes.module.css` — presentación del estado de visión.
- `desktop/src/renderer/src/__tests__/cameraScreen.test.tsx` y nuevos tests de reconocimiento — ajustar expectativas de mock y estados del nuevo contrato.

### Task 1: Transformación temporal de landmarks

**Archivos:** crear `services/recognition/landmarks.ts` y `services/recognition/landmarks.test.ts`.

- Implementar la extracción de 21 puntos xyz por mano, relativa a la muñeca, orden determinista para hasta dos manos, ceros para manos ausentes y almacenamiento de las últimas 30 muestras.
- Definir tipos exportados para landmarks del detector y vector de entrada al clasificador.
- Cubrir vectores de tamaño incorrecto, mano ausente, mano única, dos manos y ventana temporal limitada.

### Task 2: Adaptador MediaPipe y ciclo de recursos

**Archivos:** modificar `desktop/package.json`; crear `services/recognition/MediaPipeSignRecognizer.ts` y `MediaPipeSignRecognizer.test.ts`.

- Añadir `@mediapipe/tasks-vision` como dependencia de runtime.
- Construir el landmarker en modo VIDEO, limitar detección a dos manos y usar `requestVideoFrameCallback` cuando exista, con alternativa `requestAnimationFrame`.
- Esperar a vídeo listo y dimensiones válidas; evitar inferencia concurrente; enviar los timestamps requeridos por VIDEO.
- Emitir el estado de presencia de manos y el vector normalizado hacia el clasificador.
- `stop()` cancela callback/frame pendiente, elimina listeners y llama `close()` al landmarker de forma idempotente.
- Permitir inyectar fábrica de landmarker y scheduler para aislar dependencias del navegador en las pruebas.

### Task 3: Clasificador y configuración de modelo

**Archivos:** modificar `SignRecognizer.ts`; crear `SignClassifier.ts` y `SignClassifier.test.ts`.

- Definir un adaptador de clasificador independiente del detector con entrada de secuencia 30×126 y salida `{label, confidence}`.
- No añadir pesos ni elegir un formato de inferencia no soportado por un artefacto real. La fábrica devuelve estado `model-unavailable` cuando no existe un modelo configurado.
- Mapear etiqueta a `phrase.code` solo mediante tabla explícita y aplicar umbral/cooldown configurable al emitir una predicción.
- Mantener el contrato de eventos suficientemente pequeño para que `Camera.tsx` no dependa de MediaPipe.

### Task 4: Conectar cámara y presentar estados

**Archivos:** modificar `routes/Camera.tsx`, `i18n/es.ts`, `routes/routes.module.css`, `__tests__/cameraScreen.test.tsx`.

- Sustituir `MockSignRecognizer` por el reconocedor real enlazado al elemento de vídeo.
- Iniciar reconocimiento al obtener la cámara y detenerlo antes de liberar el stream; al cambiar cámara, reiniciar sobre el vídeo y stream nuevos.
- Reemplazar simulación de depuración por estados: iniciando visión, buscando manos, mano detectada, modelo no configurado y predicción reconocida.
- Validar código contra frases cargadas antes de mostrar o hablar; ignorar etiquetas desconocidas.
- Mantener sin cambios selección de cámara, reintento y manejo de errores de permiso/dispositivo.

### Task 5: Ajustar documentación de estado

**Archivos:** modificar `docs/ARCHITECTURE.md` y README.

- Describir que hay detección de manos operativa local y que el reconocimiento semántico requiere artefacto entrenado/configurado.
- No afirmar que ya reconoce señas semánticamente hasta validar el flujo con un modelo real.

## Límite de entrega

El repositorio no contiene modelo ni datos entrenados. Este plan entrega detección real de manos y la integración preparada para un clasificador. Las predicciones de señas y voz solo se activan cuando se suministre un modelo compatible; entrenarlo y validar su precisión queda fuera de esta entrega.
