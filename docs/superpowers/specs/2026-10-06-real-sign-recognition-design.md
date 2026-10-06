# Reconocimiento real de señas — Diseño

Fecha: 2026-10-06 · Estado: pendiente de revisión escrita

## Objetivo

Reemplazar la simulación de la pantalla Cámara por detección visual real en tiempo real, ejecutada localmente en el equipo. Cuando exista un modelo compatible y este prediga una seña del catálogo con confianza suficiente, se mantiene el flujo existente de mostrar la frase y reproducir su voz.

## Estado actual

- `Camera.tsx` obtiene la webcam y conecta un `MockSignRecognizer`.
- `SignRecognizer` es una interfaz con `start`, `stop` y `onSign`.
- `docs/ARCHITECTURE.md` establece MediaPipe Hand Landmarker en modo VIDEO y un clasificador local para la inferencia; TF.js u ONNX Runtime Web siguen como opciones, sin decisión previa.
- No hay modelo entrenado, pesos, conjunto de datos ni formato de modelo en el repositorio. La detección de manos por sí sola no identifica señas.

## Diseño

1. Implementar un adaptador de cámara basado en `@mediapipe/tasks-vision` que procese frames del elemento `<video>` en modo VIDEO y emita landmarks normalizados para hasta dos manos.
2. Mantener captura y predicción en el renderer. El vídeo y los landmarks permanecen locales; no se suben imágenes ni se requiere conexión para inferir.
3. Mantener `SignRecognizer` como límite de la pantalla. El reconocedor real se configura con el elemento de vídeo activo; dispone de `start/stop`, libera el landmarker al salir y no procesa frames mientras el vídeo no esté listo.
4. Separar detector de manos y clasificador de señas. Si el artefacto compatible no está disponible, la UI informa que el reconocimiento de señas todavía no está configurado; no debe presentar detecciones falsas.
5. La predicción debe incluir código y confianza. Solo códigos presentes en el catálogo pueden activar texto y voz. Se define un umbral y un cooldown configurable para evitar anuncios repetidos; los valores iniciales se fijarán con el formato/modelo disponible, sin afirmar precisión no medida.
6. Sustituir el botón de simulación de depuración por estado de visión (inicializando, buscando manos, modelo no disponible o reconocida), manteniendo la selección de cámara, reintento y vista previa.

## Modelo y datos

Esta entrega integra el runtime y el contrato para cargar un modelo local, pero no puede entregar reconocimiento semántico preciso sin un modelo entrenado. Antes de habilitar predicciones se requiere definir formato, ubicación/versionado y correspondencia entre etiquetas del modelo y `phrase.code`, además de obtener pesos entrenados con muestras representativas. Un modelo externo no se descarga implícitamente ni se inventan etiquetas.

La extracción de landmarks debe reutilizar la forma prevista por la arquitectura: secuencia temporal de 30 frames, 2 manos × 21 landmarks × xyz (126 valores por frame), normalizada respecto a la muñeca y ceros para mano ausente. Si los pesos disponibles requieren otro contrato, se documentará antes de activarlos.

## Errores y ciclo de vida

- Un permiso denegado o cámara desconectada conserva los mensajes y reintentos existentes.
- Un fallo al inicializar MediaPipe o un modelo ausente se muestra como estado de reconocimiento, separado del estado de cámara.
- Al desmontar o cambiar cámara se detienen los frames y se liberan los recursos del detector.
- No hay solicitudes de red para ejecutar inferencia.

## Pruebas y aceptación

- Tests unitarios para normalización de landmarks, manos ausentes, umbral, cooldown, mapeo de etiquetas y liberación de recursos.
- Tests de pantalla para estados de carga/modelo ausente, predicción válida y rechazo de códigos desconocidos.
- Comprobación manual con cámara real y modelo compatible: manos visibles producen landmarks y una seña del conjunto entrenado produce una sola frase/voz tras superar umbral.
- No se declara reconocimiento real de señas semánticas como funcional si no se aporta y valida un modelo compatible.

## Fuera de alcance

Entrenamiento y etiquetado de datos, endpoints de muestras, gestión de cuentas/modelos en backend, traducción de lenguaje continuo y afirmaciones de precisión sin evaluación. Estos requieren la siguiente fase y datos/modelos concretos.
