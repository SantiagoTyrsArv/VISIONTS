# SeñaVoz — Modo reunión y rediseño visual

Fecha: 2026-10-07 · Estado: aprobado en conversación, pendiente de revisión escrita

## Contexto y objetivo

SeñaVoz debe funcionar **como si fuera un plugin** de cualquier app de reuniones (Zoom, Teams, Google Meet u otra que use un micrófono), sin ser un plugin oficial de ninguna. Lo consigue presentándose a la reunión como un **micrófono virtual**: la persona que hace señas elige "CABLE Output" como micrófono una vez y, desde entonces, todo lo que SeñaVoz dice lo oyen los demás.

La comunicación es **de un solo sentido** (señas → voz). Lo que dicen los demás no se transcribe: las plataformas ya traen subtítulos automáticos.

Este documento sustituye a la "Fase 4 — Voz hacia la reunión" del roadmap de `docs/ARCHITECTURE.md` e incluye además el **rediseño visual** de toda la app, cuyo diseño de referencia está en el lienzo <https://claude.ai/artifact/Pv6uDV8yVhyTMUYfFoFkZk> (pantallas Frases, Cámara, Ajustes, Iniciar sesión y Modo reunión).

**Criterio de éxito:** en Windows, con VB-Cable instalado, el usuario entra en Modo reunión, la ventana se vuelve compacta y siempre visible, y cada frase lanzada (atajo Ctrl+Alt+1…9, clic o seña reconocida) se oye en una reunión real de Zoom o Meet que usa "CABLE Output" como micrófono, mientras la reunión tiene el foco. La voz nunca sale por los altavoces en Modo reunión. Toda la app tiene el nuevo aspecto visual. Tests en verde.

Supuestos: quien hace señas usa SeñaVoz y la reunión **en el mismo PC con Windows** y se comunica **solo** con la voz de SeñaVoz (su micrófono real no participa).

## Decisiones tomadas

| Tema | Decisión | Descartado |
|---|---|---|
| Micrófono virtual | **VB-Cable con instalación guiada**: la app detecta si falta y guía al usuario | Incluirlo en el instalador (licencia de redistribución, admin); driver propio (meses, C++, firma) |
| Generación de audio | **Voces de Windows (WinRT) en el proceso main**, con caché local | TTS neuronal en el servidor; enrutar la salida de la app desde la configuración de Windows |
| Ventana | **Una sola ventana que se transforma** en compacta | Segunda ventana (dos cámaras, dos MediaPipe, estado duplicado) |
| Atajos durante la reunión | **Globales Ctrl+Alt+1…9**, solo en Modo reunión | 1–9 globales (bloquearían esas teclas en el chat de la reunión) |

## Arquitectura

```
 Seña reconocida / clic / Ctrl+Alt+N
            │
            ▼
   SpeechService (renderer)
            │
   ¿Audio en caché para (voz, velocidad, texto)?
      sí │                         no │
         ▼                            ▼
  bytes WAV ◀──── IPC tts.synthesize ──── main: synth.ps1 (WinRT)
         │                                 → userData/tts-cache/<hash>.wav
         ▼
  HTMLAudioElement + setSinkId(dispositivo)
         │
   Modo reunión: "CABLE Input"  ──▶ VB-Cable ──▶ "CABLE Output" = micrófono de la reunión
   Fuera de él:  salida predeterminada (altavoces)
```

### Proceso main

**Sintetizador (`main/tts/`).**
- Un script PowerShell empaquetado (`synth.ps1`, en `extraResources`) usa `Windows.Media.SpeechSynthesis.SpeechSynthesizer`: lista las voces cuyo idioma empieza por `es` y sintetiza WAV con `Options.SpeakingRate`.
- Main lo invoca con `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File synth.ps1`. **Los textos viajan por stdin como JSON, nunca como argumentos**, y las rutas de salida las decide main dentro del directorio de caché.
- Una invocación procesa un **lote** (la precarga del catálogo es un solo proceso, no nueve).
- Caché: `userData/tts-cache/<sha256(voiceId|rate|text)>.wav`. El volumen no forma parte de la huella: se aplica al reproducir.
- Al cambiar de voz o velocidad, main borra los archivos que no correspondan a la combinación actual. Un archivo que no se puede leer se elimina y se regenera.
- Si la voz pedida no existe, se usa la predeterminada de Windows y el resultado lo indica.

**Modo ventana (`main/meetingWindow.ts`).**
- `enter()`: guarda los límites actuales, aplica 380×600 (mínimo 340×520) en la esquina inferior derecha de la pantalla de trabajo, o en la última posición compacta guardada, y `setAlwaysOnTop(true, 'floating')`.
- `exit()`: quita "siempre visible" y restaura los límites y el mínimo originales (900×600).
- La posición compacta se persiste en `userData/window-state.json`. La ventana conserva el marco nativo de Windows; no se usa una barra de título propia.
- La lógica de cálculo de límites es una función pura testeable; la llamada a la API de Electron es un envoltorio fino.

**Atajos globales (`main/meetingShortcuts.ts`).**
- Al entrar en Modo reunión registra `Control+Alt+1` … `Control+Alt+9` con `globalShortcut` y, al pulsarlos, envía al renderer el índice de la frase. Al salir, o al cerrar la app, los libera.
- Devuelve la lista de atajos que no se pudieron registrar (otra app los ocupa) para mostrarla.

**Permisos.** `allowPermission` añade `speaker-selection` para el propio origen, si Electron lo solicita para `setSinkId`. Sigue denegado todo lo demás.

### Contrato IPC

`SenavozApi` crece de forma acotada:

```ts
tts: {
  voices(): Promise<{ id: string; name: string; lang: string }[]>;
  synthesize(items: { text: string; voiceId: string | null; rate: number }[]):
    Promise<({ ok: true; wav: ArrayBuffer; usedFallbackVoice: boolean } | { ok: false; error: string })[]>;
  prune(keep: { voiceId: string | null; rate: number }): Promise<void>;
};
meeting: {
  enter(): Promise<{ failedShortcuts: string[] }>;
  exit(): Promise<void>;
  onShortcut(cb: (index: number) => void): () => void; // devuelve la función para cancelar la suscripción
};
```

El renderer convierte los bytes en `Blob` y reproduce desde una URL `blob:`, que la CSP ya permite (`media-src 'self' blob: data:`).

### Renderer

**Voz.**
- `GeneratedSpeechService implements SpeechService` sustituye a `WebSpeechService` como implementación principal. Pide el audio al main (con una caché en memoria de URLs `blob:` por huella), lo reproduce con `audio.volume` y llama a `setSinkId(sinkId)` antes de `play()`. Cancela lo que esté sonando antes de hablar.
- `sinkId` sale del estado de reunión: `''` (predeterminado) fuera del modo y el dispositivo del cable dentro.
- **Fuera del Modo reunión**, si la síntesis falla, recurre a `WebSpeechService` (altavoces). **Dentro, nunca**: muestra el error y no suena nada.
- `CachedAudioSpeechService` se elimina, porque lo reemplaza esta pieza.

**Precarga (`services/speech/preload.ts`).** Tras iniciar sesión, al cargar el catálogo y al cambiar voz o velocidad, sintetiza en un lote las frases cuyo audio falta, llama a `prune` y expone el progreso (`listas/total`).

**Dispositivo de salida (`services/audio/outputDevice.ts`).**
- Enumera `audiooutput` y detecta VB-Cable por etiqueta (`/CABLE Input/i`).
- El dispositivo elegido en Ajustes se persiste por `deviceId` **y** etiqueta: si el `deviceId` cambia, se busca por etiqueta.
- Vigila `devicechange` para saber si el dispositivo sigue presente.

**Estado de reunión (`store/meeting.ts`, Zustand, no persistido).** Guarda:
- si el modo está activo;
- el `sinkId` y si el dispositivo está presente;
- si la voz está en pausa;
- la última frase dicha y si está sonando;
- los atajos que fallaron;
- el progreso de la precarga.

**Reconocimiento compartido.** La cámara y el reconocedor salen de `Camera.tsx` a un hook `useSignRecognition(videoRef, cameraId)` que devuelve el estado de la cámara, el de la visión y la última seña. Lo usan la pantalla Cámara y la pantalla de reunión. Solo una de las dos está montada a la vez, así que hay una sola cámara abierta.

**Voces en Ajustes.** El selector lista `tts.voices()` en lugar de `speechSynthesis.getVoices()`. El ajuste `voiceURI` pasa a `voiceId`. Un valor antiguo se descarta y se usa la voz predeterminada, sin migración.

**Rutas.** Nueva `/reunion` dentro de `RequireAuth` pero **fuera** de `AppLayout` (sin barra lateral).
- Entrar: comprobar que existe el dispositivo del cable (si no, navegar a `/ajustes` con la sección Reunión destacada), `meeting.enter()` y navegar a `/reunion`.
- Salir: `meeting.exit()` y volver a `/frases`.
- Si la app se cierra en Modo reunión, la siguiente vez arranca en modo normal.

## Pantalla de Modo reunión (`/reunion`)

Como en el lienzo:
- **Cabecera:** el estado "En reunión" con el micrófono que debe elegirse ("CABLE Output") y un botón para volver a la ventana completa.
- **Cámara:** una miniatura con el estado de la visión ("Manos detectadas", "Sin modelo de señas: usa los atajos").
- **"Dijiste":** una franja ámbar con la última frase. Mientras suena el audio tiene una animación de pulso (respeta `prefers-reduced-motion`), porque el usuario no oye la voz y necesita confirmación visual.
- **Frases:** una cuadrícula de 3×3 con el número de atajo y el texto abreviado (texto completo en `aria-label`). Clic o Ctrl+Alt+N las dice.
- **Pie:** "Pausar voz" (con pausa, no se dice nada, sea por seña, clic o atajo, hasta reanudar) y "Salir del modo".
- **Avisos dentro de la ventana:** preparando voces (`4/9`); "Los demás no te oyen: no se encuentra el micrófono virtual"; atajos no disponibles; error de síntesis.

## Rediseño visual

Referencia: el lienzo citado arriba. Se aplica a todas las pantallas.

- **Tokens** en `styles.css`:
  - Fondo `#0F1114`, superficie `#181B20`, barra lateral `#14171B`, bordes `#262A31` / `#2A2F38`, texto `#F2F0EA`, texto atenuado `#A3A8B3`.
  - **Ámbar `#FFB547`** (texto encima `#1A1206`) solo para lo que habla: frases, voz, "Sonando ahora", "Dijiste".
  - **Azul `#7AB8FF`** solo para estados "activo / detectado / listo".
  - Peligro `#FFA597`.
- **Tipografía:** Atkinson Hyperlegible para el texto y Bricolage Grotesque para los títulos, **empaquetadas** con `@fontsource/atkinson-hyperlegible` y `@fontsource-variable/bricolage-grotesque`, porque la CSP no permite Google Fonts.
- **Accesibilidad:** objetivos táctiles de al menos 44 px, contraste de al menos 4.5:1 en el texto y el foco visible actual.
- **Barra lateral:** marca, navegación con iconos SVG de trazo (Frases, Cámara, Ajustes) y, abajo, una tarjeta con el estado del micrófono virtual y el botón "Modo reunión".
- **Frases:** cabecera con la indicación "Suena en: Altavoces"; franja "Sonando ahora" con botón Detener; cuadrícula de 3 columnas de tarjetas con tecla de atajo; la tarjeta que suena queda resaltada.
- **Cámara:** vídeo grande con el estado superpuesto y la seña reconocida; panel lateral con Estado (cámara, manos, modelo), aviso "Falta un modelo entrenado" con enlace a Frases, y Últimas señas.
- **Ajustes** (en orden):
  - **Reunión:** estado de VB-Cable, selector de salida, recordatorio "elige CABLE Output", "Probar en la reunión", que dice la frase de prueba por el cable; si falta VB-Cable, los 3 pasos, "Descargar VB-Cable", que abre `https://vb-audio.com/Cable/` en el navegador, y "Comprobar de nuevo".
  - **Voz:** selector, controles deslizantes de volumen y velocidad que sustituyen a los botones +/−, y "Probar voz".
  - **Cámara.**
  - **Perfil** con "Cerrar sesión".
- **Autenticación:** panel ámbar de marca ("Tus señas, con voz en cualquier reunión.") junto al formulario. Lo usan Iniciar sesión, Registro y Recuperar contraseña a través de `AuthScreen`.
- Los textos nuevos se añaden a `i18n/es.ts`.

## Errores y casos límite

- **VB-Cable no instalado al pulsar "Modo reunión":** no se entra; se abre Ajustes › Reunión con la guía.
- **El dispositivo desaparece durante la reunión:** aviso visible, las frases no se envían (no se encolan) y se reanuda solo cuando vuelve. Lo mismo si `setSinkId` falla.
- **Precarga incompleta:** se entra igual; una frase sin audio se sintetiza al pedirla (≈1 s).
- **Voz elegida desinstalada:** se usa la predeterminada de Windows; Ajustes lo indica.
- **Síntesis imposible:**
  - En reunión: aviso y silencio.
  - Fuera de ella: `WebSpeechService`.
- **Cámara en uso (`NotReadableError`):** el mensaje deja de decir "ciérrala". Explica que esa cámara no admite dos apps a la vez y propone dos salidas:
  - activar el uso compartido de la cámara en Configuración de Windows, si la versión lo ofrece (la ruta exacta se verifica al implementar);
  - usar otra cámara.
- **Atajo ocupado:** se lista en la ventana compacta y en Ajustes; los demás atajos funcionan.

## Pruebas

**Automáticas (Vitest):**
- **main:** huella de la caché, poda y regeneración de archivos dañados, con un ejecutor de PowerShell simulado; cálculo de límites del modo compacto (entrar, salir, posición guardada, pantalla pequeña); registro y liberación de atajos y retorno de los fallidos con `globalShortcut` simulado; `allowPermission` con `speaker-selection`.
- **renderer:**
  - `GeneratedSpeechService` llama a `setSinkId` con el dispositivo del cable; no usa `speechSynthesis` en Modo reunión; recurre a él fuera.
  - Detección de "CABLE Input" y búsqueda por etiqueta.
  - Pausa y dispositivo ausente bloquean el envío.
  - Precarga solo de lo que falta.
  - Pantallas: Ajustes › Reunión (detectado / no instalado), `/reunion` (frase, pulso, pausa, avisos) y redirección a Ajustes sin cable.
  - Los tests existentes se adaptan al rediseño.

**Manuales en este PC (se piden al usuario las comprobaciones que requieren oír):**
1. Instalar VB-Cable y comprobar que Ajustes lo detecta.
2. Abrir Zoom o Meet con "CABLE Output" como micrófono y entrar en Modo reunión. Con la reunión enfocada, pulsar Ctrl+Alt+N: el medidor de micrófono de la reunión reacciona y la frase se oye en su prueba de micrófono. No sale nada por los altavoces.
3. Deshabilitar el dispositivo del cable en Windows a mitad de la prueba: aparece el aviso; al rehabilitarlo, sigue funcionando.
4. Salir del modo: la ventana recupera su tamaño y los atajos Ctrl+Alt dejan de responder.
5. `npm run build:win`: el ejecutable empaquetado encuentra `synth.ps1` y genera audio.

## Fuera de alcance

Cámara virtual, driver de micrófono propio, incluir VB-Cable en el instalador, transcripción de lo que dicen los demás, modelo de reconocimiento de señas (Fases 2–3), voces neuronales del servidor, barra de título propia, macOS/Linux.
