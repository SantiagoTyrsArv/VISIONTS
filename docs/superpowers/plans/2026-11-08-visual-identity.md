# Identidad visual «la mano que habla»: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cambiar el aspecto de la app de escritorio, que pasa a centrarse en la persona que signa. Incluye paleta nueva, un logo de mano animado, una pantalla de carga con una mano que cambia de postura, la Cámara como pantalla principal y transiciones suaves.

**Architecture:**
- **Paleta:** se cambian los valores de las variables CSS existentes.
- **Logo:** es un componente SVG con animación CSS en dos modos.
- **Mano de la carga:** un módulo puro calcula su geometría y un componente la anima con `requestAnimationFrame`.
- **Pantalla de carga:** una capa superpuesta en `App` que solo se ve al arrancar.
- **Transiciones y animaciones de componentes:** usan `motion` (`AnimatePresence`, `MotionConfig reducedMotion="user"`). El hover se hace con CSS.

**Tech Stack:** Electron + React 19, CSS Modules, zustand, TanStack Query, react-router 8, `motion` (nuevo), Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-08-visual-identity-design.md`. Para las rutas de SVG, las posturas y los colores, el spec es la fuente: este plan no los repite salvo donde una prueba los fija.

Todas las rutas son relativas a `desktop/src/renderer/src/` salvo que se diga otra cosa. Los comandos se ejecutan en `desktop/`.

## Global Constraints

- Textos de interfaz en español, siempre vía `t()` desde `i18n/es.ts`; nada de cadenas sueltas en JSX.
- Con `prefers-reduced-motion: reduce` todo queda quieto: logo estático, mano en la postura «Abierta», sin anillos, entradas ni transiciones.
- Contraste de todo texto ≥ 4,5:1 sobre su fondo.
- Sin red: nada de CDN. Las fuentes siguen viniendo de `@fontsource`.
- Duraciones de animación entre 150 y 600 ms y sin rebotes. Transición entre pantallas: 250 ms, entrada con 8 px hacia arriba. Entrada de paneles: 0,6 s, 10 px, 80 ms de desfase.
- La pantalla de carga solo sale al arrancar, dura al menos 1 200 ms y sale con un fundido de 300 ms. La síntesis de voz no la bloquea.
- Antes de cada commit tienen que pasar `npm run lint`, `npm run typecheck` y `npm test`.
- Commits que terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Falla la red al arrancar.** Si `restore()` termina sin sesión, la pantalla de carga se va al acceso y no se queda colgada. La prueba está en la Task 4.
2. **Falla la carga de frases o del modelo al arrancar con sesión.** La pantalla de carga termina igualmente. La prueba está en la Task 4.
3. **Cerrar sesión y volver a entrar.** La pantalla de carga no vuelve a salir. La prueba está en la Task 5.
4. **Pulsar «3» en Señas justo después de cambiar de pantalla.** La frase suena una sola vez, sin un segundo listener de la pantalla que sale. La prueba está en la Task 6.
5. **Movimiento reducido.** La mano de carga no arranca `requestAnimationFrame`. La prueba está en la Task 3.

---

### Task 1: Paleta «Noche cálida» y base de `motion`

**Files:**
- Modify: `styles.css` (variables de `:root` según la tabla del spec; bloque global `@media (prefers-reduced-motion: reduce)` que anula `animation` y `transition`)
- Modify: `routes/routes.module.css`, `routes/meeting.module.css`, `ui/ui.module.css` (los colores hex escritos a mano pasan a variables; p. ej. `#1b1f25` en `.meetingCard` → `var(--surface)`, `#111315` → `var(--bg)`)
- Modify: `test/setup.ts` (`MotionGlobalConfig.skipAnimations = true`, desde `motion`)
- Modify: `desktop/package.json` (dependencia `motion`)
- Test: `__tests__/theme.test.ts`

**Interfaces:**
- Produces: las variables CSS del spec y el paquete `motion` instalado. Con las animaciones de `motion` desactivadas en las pruebas, `AnimatePresence` desmonta al instante.

- [ ] **Step 1: Write the failing test.** `theme.test.ts` importa `../styles.css?raw` y comprueba lo siguiente:

```ts
it.each([
  ['--bg', '#121320'], ['--surface', '#1A1C2B'], ['--surface-side', '#161826'],
  ['--surface-raised', '#24273A'], ['--border', '#2E3147'], ['--text', '#F5F2EA'],
  ['--text-muted', '#ADB0C4'], ['--accent', '#FFB547'], ['--accent-text', '#1E1405'],
  ['--live', '#6EDCC0'],
])('%s vale %s', (name, value) => {
  expect(css).toMatch(new RegExp(`${name}:\\s*${value};`, 'i'));
});
it('para todo con reducir movimiento', () => {
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
});
```

- [ ] **Step 2:** `npx vitest run src/renderer/src/__tests__/theme.test.ts` → FAIL (valores antiguos).
- [ ] **Step 3:** Cambiar las variables, añadir el bloque de movimiento reducido, sustituir los hex sueltos de los `.module.css` y ejecutar `npm i motion`. Añadir `MotionGlobalConfig.skipAnimations = true` en `test/setup.ts`.
- [ ] **Step 4:** `npm test` → PASS (todas las pruebas existentes siguen pasando).
- [ ] **Step 5: Commit** `feat(desktop): paleta Noche cálida y base de motion`

---

### Task 2: Logo de la mano

**Files:**
- Create: `ui/Logo.tsx`, `ui/logo.module.css`
- Modify: `ui/Brand.tsx` (usa `Logo` en vez de `IconWave`; la placa `.brandMark` desaparece)
- Modify: `ui/AuthScreen.tsx` (borra `BARS` y `.authBars`; la marca usa el logo continuo y el tono `onAccent`, porque el panel es ámbar)
- Modify: `routes/Meeting.tsx` (el `IconWave` de la cabecera pasa a `Logo` con 16 px, `mode="once"` y el tono que corresponda a `.mark`)
- Modify: `ui/icons.tsx` (borrar `IconWave`)
- Modify: `ui/ui.module.css`, `routes/meeting.module.css` (borrar los estilos que queden sin uso)
- Test: `__tests__/logo.test.tsx`

**Interfaces:**
- Produces: `Logo({ size = 40, mode = 'once', tone = 'default' }: { size?: number; mode?: 'continuous' | 'once'; tone?: 'default' | 'onAccent' })`. Devuelve un `<svg aria-hidden="true" viewBox="0 0 120 120" data-mode={mode}>` con el contorno, el interior y las 3 ondas del spec.
- Produces: `Brand({ inverted?: boolean; logoMode?: 'continuous' | 'once' })`, que por defecto usa `'once'`.

- [ ] **Step 1: Write the failing test.**
  - `Logo` con `mode="continuous"` pinta un svg con `data-mode="continuous"` y tres elementos `[data-part="wave"]`.
  - `Brand` sin props usa `data-mode="once"`.
  - Renderizar `Login`, como en el `login.test.tsx` existente, da un svg de logo con `data-mode="continuous"`.
- [ ] **Step 2:** `npx vitest run src/renderer/src/__tests__/logo.test.tsx` → FAIL (no existe `@/ui/Logo`).
- [ ] **Step 3: Implementar.**
  - **Animación (CSS):** el grupo de la mano tiene `transform-box: view-box; transform-origin: 51px 104px`. Oscila ±5° en 4,8 s y las ondas van de opacidad 0,2 a 1 en 2,4 s, con 0,25 s de desfase.
  - **`once`:** un ciclo de oscilación y uno de ondas con `animation-iteration-count: 1`. Las ondas terminan a opacidad 1 (`animation-fill-mode: forwards`, con su propio keyframe que acaba en 1).
  - **Grosor del trazo:** 5,5 si `size ≥ 64`; si no, 7.
  - **`onAccent`:** todo el logo en `var(--accent-text)`. En `default`, la mano va en `currentColor` y las ondas en `var(--accent)`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): logo de la mano con animación continua o de un saludo`

---

### Task 3: Mano que signa (geometría y componente)

**Files:**
- Create: `ui/loading/handPose.ts`, `ui/loading/SigningHand.tsx`, `ui/loading/loading.module.css`
- Test: `ui/loading/handPose.test.ts`, `__tests__/signingHand.test.tsx`

**Interfaces:**
- Produces (en `handPose.ts`):
  - `type HandPose = { fingers: readonly [number, number][]; thumb: readonly [number, number, number, number] }`. Los dedos son `[ángulo°, largo]` de izquierda a derecha; el pulgar es `[x, y, ángulo°, largo]`.
  - `POSES: readonly HandPose[]`: las 5 posturas del spec, en orden (Abierta, Abanico, Puño, «L», «V»).
  - `FINGER_BASES = [25.5, 38.5, 51.5, 64.5]` y `FINGER_BASE_Y = 62`.
  - `HOLD_MS = 800` y `TRANSITION_MS = 500`.
  - `segmentPath(x: number, y: number, angleDeg: number, length: number): string`. Devuelve `"M{x} {y} L{x2} {y2}"`, con un decimal como máximo. El ángulo se mide desde la vertical y es positivo hacia la derecha: `x2 = x + sin·len`, `y2 = y − cos·len`.
  - `poseAt(timeMs: number): HandPose`. Mantiene cada postura `HOLD_MS` y después interpola hacia la siguiente durante `TRANSITION_MS` con easing cúbico de entrada y salida. Es cíclica.
  - `handPaths(pose: HandPose): { fingers: string[]; thumb: string }`.
- Produces: `SigningHand({ animate }: { animate: boolean })`. Es un SVG decorativo (`aria-hidden`) con las capas en el orden del spec (exterior 17 en `--text`, interior 9 en `--bg`, palma con relleno y trazo 8), las ondas desplazadas `translate(12 6)` y la oscilación ±3° en 5 s por CSS. Con `animate={false}` pinta `POSES[0]` y no llama a `requestAnimationFrame`.

- [ ] **Step 1: Write the failing tests.**

```ts
expect(segmentPath(25.5, 62, 0, 32)).toBe('M25.5 62 L25.5 30');
expect(segmentPath(80, 68, -90, 28)).toBe('M80 68 L52 68');
expect(poseAt(0)).toEqual(POSES[0]);
expect(poseAt(799)).toEqual(POSES[0]);
expect(poseAt(1300)).toEqual(POSES[1]);
expect(poseAt(1050).fingers[0][0]).toBeCloseTo(-7);   // mitad de 0 → −14
expect(poseAt(1300 * POSES.length)).toEqual(POSES[0]);  // vuelve a empezar
expect(handPaths(POSES[0]).fingers).toHaveLength(4);
```

  En `signingHand.test.tsx`, espiar `window.requestAnimationFrame`:
  - Con `animate={false}` no se llama nunca, y el primer `path` de dedo tiene `d="M25.5 62 L25.5 30"`.
  - Con `animate` sí se llama, y al desmontar se llama a `cancelAnimationFrame`.
- [ ] **Step 2:** `npx vitest run src/renderer/src/ui/loading src/renderer/src/__tests__/signingHand.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar. El componente guarda el tiempo en estado y lo actualiza como mucho cada ~30 ms.
- [ ] **Step 4:** El mismo comando → PASS.
- [ ] **Step 5: Commit** `feat(desktop): mano animada que cambia entre posturas de señas`

---

### Task 4: Pasos de arranque y pantalla de carga

**Files:**
- Create: `ui/loading/startupSteps.ts`, `ui/loading/LoadingScreen.tsx`
- Modify: `i18n/es.ts`. Añadir `'loading.title': 'Cargando SeñaVoz'`, `'loading.session': 'Comprobando tu sesión'`, `'loading.model': 'Cargando el modelo de señas'`, `'loading.phrases': 'Cargando tus frases'` y `'loading.privacy': 'Todo se procesa en este equipo. Tu cámara no sale de aquí.'`.
- Test: `ui/loading/startupSteps.test.ts`, `__tests__/loadingScreen.test.tsx`

**Interfaces:**
- Produces:
  - `type StepStatus = 'pending' | 'active' | 'done'`.
  - `type StartupInput = { session: 'loading' | 'authenticated' | 'unauthenticated'; model: 'loading' | 'ready' | 'error'; phrases: 'loading' | 'done' }`. `phrases` vale `'done'` cuando hay datos o la carga falló.
  - `startupSteps(i: StartupInput): { steps: { key: 'session' | 'model' | 'phrases'; status: StepStatus }[]; finished: boolean; progress: number }`. `progress` va de 0 a 1 y es el número de pasos hechos entre el total.
- Produces: `LoadingScreen({ steps, progress, animate }: { steps: …; progress: number; animate: boolean })`. Muestra `SigningHand`, `Brand` (logo `continuous`), el lema `auth.claim`, la barra de progreso, la lista de pasos y `loading.privacy`. Usa `role="status"`, `aria-live="polite"` y `aria-label={t('loading.title')}`. Los anillos son CSS y no se pintan con `animate={false}`.

- [ ] **Step 1: Write the failing tests.**
  - `session: 'loading'` → 3 pasos `[active, pending, pending]`, `finished: false`.
  - `session: 'unauthenticated'` (con cualquier `model` o `phrases`) → 1 paso `session: done`, `finished: true`, `progress: 1`.
  - `authenticated`, `model: 'loading'`, `phrases: 'loading'` → `[done, active, active]`, sin terminar, `progress` ≈ 1/3.
  - `authenticated`, `model: 'error'`, `phrases: 'done'` → todo `done`, `finished: true`.
  - `LoadingScreen` con esos pasos muestra los textos de `es.ts`, y el elemento `status` tiene el nombre «Cargando SeñaVoz».
- [ ] **Step 2:** `npx vitest run src/renderer/src/ui/loading/startupSteps.test.ts src/renderer/src/__tests__/loadingScreen.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar. Un paso hecho muestra su punto en `--live`, el activo en `--accent` y el pendiente en `--border`.
- [ ] **Step 4:** El mismo comando → PASS.
- [ ] **Step 5: Commit** `feat(desktop): pantalla de carga con los pasos reales del arranque`

---

### Task 5: Capa de arranque en `App`

**Files:**
- Create: `ui/loading/BootOverlay.tsx`
- Modify: `App.tsx` (envolver en `<MotionConfig reducedMotion="user">` y montar `<BootOverlay />` dentro de `QueryClientProvider`, por encima del router)
- Modify: `routes/Guard.tsx` (mientras la sesión carga devuelve `null` en lugar de `<Splash />`)
- Delete: `ui/Splash.tsx`, la clase `.splash` y la clave `app.loading`
- Modify: `__tests__/guard.test.tsx` (la prueba del splash pasa a «mientras carga no pinta ni login ni la ruta»)
- Test: `__tests__/bootOverlay.test.tsx`

**Interfaces:**
- Consumes: `startupSteps` y `LoadingScreen` (Task 4); `useSession`, `useSignModel` y `PHRASES_KEY` de `@/api/usePhrases`.
- Produces: `BootOverlay()` y las constantes exportadas `MIN_BOOT_MS = 1200` y `BOOT_FADE_MS = 300`. Funciona así:
  - Lee el estado de las frases con `useQueryClient().getQueryState(PHRASES_KEY)`, suscrito vía `useSyncExternalStore` sobre `queryCache.subscribe`. No lanza la consulta.
  - Cuando `finished` es verdadero y han pasado `MIN_BOOT_MS`, marca `booted` en estado local y la capa sale con `AnimatePresence`.
  - Una vez `booted`, no vuelve a mostrarse durante la vida de la app.
  - Es una capa fija a pantalla completa (`position: fixed; inset: 0; z-index` alto) con fondo `--bg`.
  - Pasa `animate={!useReducedMotion()}` a `LoadingScreen`.

- [ ] **Step 1: Write the failing tests.** Usar `vi.useFakeTimers()` y un `QueryClient` de prueba:
  - Con sesión `loading`, se ve `status` «Cargando SeñaVoz».
  - Pasar a `unauthenticated` y avanzar 1 200 ms → la capa desaparece. Este es el punto 1 de Review Focus.
  - Con `authenticated`, modelo `error` y la consulta `['phrases']` en error, tras 1 200 ms desaparece. Este es el punto 2 de Review Focus.
  - Con todo terminado a los 100 ms, todavía se ve a los 1 000 ms.
  - Tras desaparecer, poner la sesión en `loading`, después `unauthenticated` y después `authenticated` → no vuelve a aparecer. Este es el punto 3 de Review Focus.
- [ ] **Step 2:** `npx vitest run src/renderer/src/__tests__/bootOverlay.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar y actualizar `Guard` y su prueba.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): la pantalla de carga cubre el arranque y solo sale una vez`

---

### Task 6: Transiciones entre pantallas y Señas como inicio

**Files:**
- Create: `ui/motion/PageTransition.tsx`
- Modify: `App.tsx`. Las rutas se agrupan y se animan por grupo: `/login`, `/register` y `/reunion` son cada una un grupo propio; todo lo que va dentro de `AppLayout` es un único grupo `app`. Se usa `<AnimatePresence mode="wait" initial={false}>` con `<Routes location={location}>` dentro del elemento con clave. El comodín pasa a `/camara`.
- Modify: `routes/AppLayout.tsx`
  - El `<Outlet />` pasa a `useOutlet()`, dentro de `AnimatePresence mode="wait"` y con la ruta como clave, para que la barra lateral no se mueva.
  - Nuevo orden de enlaces: `/camara` (`nav.camera` con `IconHand`), `/frases` y `/ajustes`.
  - El logo de la barra lateral pasa a `Brand` con `logoMode="once"`.
- Modify: `routes/Guard.tsx`, `routes/Meeting.tsx` y `hooks/useMeetingMode.ts` (`/frases` → `/camara`)
- Modify: `ui/icons.tsx` (añadir `IconHand`, la mano del logo en `viewBox` 24, solo trazo)
- Modify: `i18n/es.ts` (`'nav.camera': 'Señas'`)
- Modify: `__tests__/guard.test.tsx` y `__tests__/meetingScreen.test.tsx` (las redirecciones esperan `/camara`)
- Test: `__tests__/pageTransition.test.tsx`

**Interfaces:**
- Produces: `PageTransition({ children }: { children: ReactNode })`, un `motion.div` que entra con `opacity 0 → 1` e `y 8 → 0`, sale con `opacity → 0`, en 0,25 s y con `ease: 'easeOut'`. Se usa tanto en `App` como en `AppLayout`.

- [ ] **Step 1: Write the failing tests.** Con `MemoryRouter` y el árbol de rutas de `App`, extraído a un componente exportado `AppRoutes`:
  - Con sesión `authenticated`, ir a `/` muestra el `h1` «Tus manos hablan». Hasta la Task 7, basta con comprobar que la ruta activa es `/camara`.
  - El primer enlace de la navegación se llama «Señas».
  - Ir de `/frases` a `/camara` mantiene montado el mismo elemento `nav`: se comprueba que es la misma referencia de nodo.
  - En `/camara`, tras navegar desde `/frases`, pulsar «3» llama una sola vez a `speechService.speak`. Este es el punto 4 de Review Focus; la prueba se completa en la Task 7, cuando la Cámara tenga atajos.
- [ ] **Step 2:** `npx vitest run src/renderer/src/__tests__/pageTransition.test.tsx` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): transiciones entre pantallas; Señas es la pantalla de inicio`

---

### Task 7: Pantalla Señas (Cámara) rediseñada

**Files:**
- Modify: `routes/Camera.tsx`, `routes/routes.module.css`
- Create: `ui/NowSaying.tsx` (la banda ámbar)
- Modify: `routes/Phrases.tsx`. Su bloque `nowPlaying` pasa a usar `NowSaying`, para que la misma pieza sirva en las dos pantallas.
- Modify: `i18n/es.ts`. `'camera.title': 'Tus manos hablan'`, `'camera.recentTitle': 'Lo que has dicho'`, `'camera.quickTitle': 'Frases rápidas'` y `'camera.quickHint': 'pulsa su número'`. Borrar `camera.signDetected` si queda sin uso.
- Modify: `__tests__/cameraScreen.test.tsx`
- Test: `__tests__/nowSaying.test.tsx`

**Interfaces:**
- Consumes: `usePlayback` (`lastText`, `playing`), `usePhraseShortcuts(phrases, onPhrase)`, `speechService.speak/stop` y `PhraseCard`, o un botón compacto con la misma accesibilidad: `aria-label` `home.speakA11y` y `aria-keyshortcuts`.
- Produces: `NowSaying({ overlay?: boolean })`.
  - No pinta nada si `lastText` es `null`.
  - Pinta una `section` con `aria-live="polite"`. La etiqueta es `home.nowPlaying` si `playing` y `home.lastSaid` si no. Muestra el texto y el botón `home.stop`, que llama a `speechService.stop()`.
  - Si cambia el texto, la entrada se anima con `motion`, usando el texto como clave.
  - `overlay` lo coloca sobre la parte baja del vídeo.

- [ ] **Step 1: Write the failing tests.**
  - En `nowSaying.test.tsx`:
    - Sin `lastText` no hay `section`.
    - Con `usePlayback.setState({ lastText: 'Hola', playing: true })` se ve «Sonando ahora» y «Hola».
    - Con `playing: false` se ve «Lo último que dijiste».
    - Al pulsar «Detener» se llama a `stop`.
  - Cambios en `cameraScreen.test.tsx`:
    - La seña reconocida de «Hola» aparece en `list` con el nombre «Lo que has dicho».
    - Pulsar el botón de frase rápida «Hola» llama a `speak` con `{ code: 'hello', text: 'Hola' }` y añade «Hola» a esa lista.
    - Pulsar la tecla `1` hace lo mismo.
    - Tras 6 frases, la lista tiene 5 elementos y el primero es el más reciente.
    - El `h1` es «Tus manos hablan».
    - Se borran las aserciones sobre «Seña detectada: …».
  - Completar la prueba del punto 4 de Review Focus en `pageTransition.test.tsx`.
- [ ] **Step 2:** `npx vitest run src/renderer/src/__tests__/nowSaying.test.tsx src/renderer/src/__tests__/cameraScreen.test.tsx` → FAIL.
- [ ] **Step 3: Implementar.**
  - `Camera` define `say(p)`. Esta función hace `setRecent` (máximo 5, el más reciente primero) y llama a `speechService.speak`. La usan las señas, los botones y `usePhraseShortcuts`.
  - **Distribución, igual que el tablero «Cámara» del prototipo:**
    - Vídeo grande con el chip de manos y `NowSaying overlay`.
    - A la derecha, «Lo que has dicho» y «Estado».
    - Debajo, la fila de frases rápidas: las 9 primeras, con su número.
  - Los paneles entran escalonados con `motion` según los valores de Global Constraints.
  - Cada nuevo elemento de «Lo que has dicho» entra deslizando desde la izquierda.
  - El punto «activo» pulsa en menta con CSS.
  - El panel Diagnóstico sigue igual.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(desktop): Señas como pantalla central, con la frase que suena y frases rápidas`

---

### Task 8: Microanimaciones de los componentes

**Files:**
- Modify: `ui/ui.module.css` (`.card`, botones de `Button`), `routes/routes.module.css` (`.navLink`, `.meetingBtn`, `.section`), `routes/Settings.tsx` y `routes/Phrases.tsx` (entrada escalonada de secciones y tarjetas con `motion`)
- Test: `__tests__/theme.test.ts` (ampliar)

**Interfaces:**
- Consumes: los valores de animación de Global Constraints.

- [ ] **Step 1: Write the failing test.** En `theme.test.ts`, importar `ui/ui.module.css?raw` y `routes/routes.module.css?raw` y comprobar:
  - `.card:hover` y `.navLink:hover` declaran `transform`.
  - Ninguna `transition` dura más de 600 ms. Se comprueba con una expresión regular sobre `/transition:[^;]*?(\d+(?:\.\d+)?)(ms|s)/g`.
- [ ] **Step 2:** `npx vitest run src/renderer/src/__tests__/theme.test.ts` → FAIL.
- [ ] **Step 3: Implementar.**
  - Tarjetas y botones suben 2 px al pasar el ratón, con sombra suave.
  - La navegación se desplaza 2 px al pasar el ratón.
  - Transición: `cubic-bezier(.2,.7,.2,1)` en 200 ms.
  - Al pulsar, `:active` vuelve a `transform: none`.
- [ ] **Step 4:** `npm test` → PASS. Ejecutar también `npm run lint` y `npm run typecheck` → sin errores.
- [ ] **Step 5: Commit** `feat(desktop): animaciones suaves de hover y entrada en los componentes`

---

### Task 9 (opcional): Icono de la aplicación

**Files:**
- Create: `desktop/scripts/make-icon.mjs`, un script de un solo uso que pasa el SVG del logo, sobre una placa ámbar de esquinas redondeadas, a PNG de 512 px con `sharp` (dependencia de desarrollo)
- Modify: `desktop/resources/icon.png`

- [ ] **Step 1:** `node scripts/make-icon.mjs` → genera `resources/icon.png` de 512×512.
- [ ] **Step 2:** `npm run dev`: la ventana y la barra de tareas muestran el icono nuevo. Esta comprobación la hace el usuario.
- [ ] **Step 3: Commit** `chore(desktop): icono de la app con el logo nuevo`

---

## Verificación final (manual, la hace el usuario)

`npm run dev` y comprobar:
1. **Arranque:** se ve la mano cambiando de postura y la lista de pasos; después entra en Señas con un fundido.
2. **Navegación:** al ir de Señas a Frases y a Ajustes, la barra lateral no se mueve y el contenido cambia con suavidad.
3. **Cerrar sesión:** lleva al acceso, con el logo animado sin parar. Al iniciar sesión se entra en Señas **sin** pantalla de carga.
4. **Modo reunión:** el logo saluda una vez y se queda quieto.
5. **Movimiento reducido:** con «Efectos de animación» desactivado en Windows (Accesibilidad › Efectos visuales), todo queda quieto.
