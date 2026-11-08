# Identidad visual de SeñaVoz: la mano que habla

Fecha: 2026-11-08 · App: `desktop/` (Electron + React 19 + CSS Modules)

Prototipo aprobado en Claude Design: https://claude.ai/artifact/NQgkvwrc4z1T6GNz5F8t6S
(tableros «Identidad», «Pantalla de carga» y «Cámara»). El prototipo es la referencia visual;
este documento manda donde difieran.

## Intención y por qué

La app funciona, pero su aspecto es el de una herramienta técnica genérica y la marca cuenta
la *salida* (una onda de voz), no a la persona. SeñaVoz es para la persona sorda que signa;
quien escucha es secundario. En los primeros segundos tiene que transmitir **respeto,
inclusión, velocidad y un propósito claro**. La persona debería pensar: «entiende exactamente
lo que necesito, sin rodeos» y «la interfaz está diseñada pensando en mí, no adaptada a la
fuerza».

Idea central: **primero las manos; la voz es la consecuencia.**

## Objetivos

1. Logo nuevo: una mano de trazo único y puntas redondeadas (cuatro dedos juntos, pulgar
   recogido sobre la palma) con tres ondas de voz ámbar a la derecha. Con **animación continua**.
2. **Pantalla de carga** con la misma mano, que **cambia entre posturas de señas** con
   transiciones suaves.
3. Paleta «Noche cálida» en lugar del grafito actual.
4. **Animaciones suaves** en los componentes (entradas, hover, cambios de estado y la lista de
   frases dichas) y **transiciones suaves entre pantallas**.
5. La pantalla Cámara pasa a ser la principal y pone a la persona en el centro.

## No objetivos

- No cambia la lógica de reconocimiento, voz, reunión, autenticación ni el backend.
- No se añaden idiomas ni se reescriben textos fuera de los citados aquí.
- No hay tema claro.
- Las posturas de la animación **no** pretenden ser señas LSC correctas: son ilustrativas.

## Anti-objetivos (fracaso aunque «funcione»)

- Animaciones que distraigan durante una reunión, o que retrasen el uso. La pantalla de carga
  nunca debe hacer esperar más de lo que tarda la carga real, salvo el mínimo indicado abajo.
- Ignorar «reducir movimiento» de Windows: con `prefers-reduced-motion: reduce` **todo**
  queda quieto (logo estático, mano en la postura abierta, sin entradas animadas).
- Perder contraste: todo texto ≥ 4,5:1 sobre su fondo.
- Líneas que se cruzan o solapan en la mano (fue un problema real del prototipo; ver
  «Construcción de la mano animada»).

## Restricciones

- Mismo stack: React 19, CSS Modules, variables CSS en `src/renderer/src/styles.css`, textos
  en `src/renderer/src/i18n/es.ts` vía `t()`.
- Las tipografías se mantienen (ya instaladas por `@fontsource`): Bricolage Grotesque
  (títulos) y Atkinson Hyperlegible (texto).
- Todo debe funcionar sin red (Electron, sin CDN).
- Pruebas con Vitest + Testing Library, como el resto del proyecto. `npm run lint`,
  `npm run typecheck` y `npm test` deben pasar.

## Decisiones

### Paleta «Noche cálida» (decisión aprobada)

Se cambian los valores de las variables existentes en `styles.css`, sin renombrarlas, para que
todas las pantallas cambien a la vez:

| Variable | Antes | Ahora | Uso |
|---|---|---|---|
| `--bg` | #0f1114 | #121320 | fondo |
| `--surface` | #181b20 | #1A1C2B | paneles |
| `--surface-side` | #14171b | #161826 | barra lateral |
| `--surface-raised` | #22262d | #24273A | hover, activo |
| `--border` | #262a31 | #2E3147 | bordes |
| `--border-strong` | #3a404b | #3D4160 | bordes marcados |
| `--text` | #f2f0ea | #F5F2EA | texto |
| `--text-muted` | #a3a8b3 | #ADB0C4 | texto secundario |
| `--text-nav` | #b4b9c3 | #C3C5D6 | navegación |
| `--accent` | #ffb547 | #FFB547 | ámbar: **lo que suena** |
| `--accent-text` | #1a1206 | #1E1405 | texto sobre ámbar |
| `--live` | #7ab8ff | #6EDCC0 | menta: **manos detectadas / activo** |
| `--live-soft` | #1c2a3d | #183A35 | fondo suave del estado activo |
| `--live-text` | #a9d0ff | #9FEBD6 | texto del estado activo |

El resto de variables se ajusta al mismo tono si hace falta (decisión del implementador),
manteniendo ≥ 4,5:1. Los colores fijos que hoy están escritos a mano en los `.module.css`
(p. ej. `#1b1f25` en `.meetingCard`) pasan a usar variables.

### Logo (decisión aprobada)

SVG en `viewBox="0 0 120 120"`, trazo `currentColor`, `stroke-linecap/linejoin: round`:

```
Contorno: M22 86 V30 A6 6 0 0 1 34 30 V16 A6 6 0 0 1 46 16 V10 A6 6 0 0 1 58 10
          V22 A6 6 0 0 1 70 22 V54 Q70 58 76 58 Q80 58 80 64 V86
          A18 18 0 0 1 62 104 H40 A18 18 0 0 1 22 86 Z
Interior: M34 30 V52 M46 16 V52 M58 22 V52 M76 58 H50 A6 6 0 0 0 50 70 L64 74
Ondas (ámbar): M95.1 50.9 A10 10 0 0 1 95.1 65.1
               M100.7 45.3 A18 18 0 0 1 100.7 70.7
               M106.4 39.6 A26 26 0 0 1 106.4 76.4
```

Grosor 5,5 a tamaño grande; ~7 a 32–40 px para que no se pierda. Sobre fondo ámbar todo el
logo va en `--accent-text`.

**Animación**, solo CSS: la mano oscila ±5° alrededor de la muñeca (51, 104) en un ciclo de
4,8 s, y las tres ondas pasan de opacidad 0,2 a 1 con 0,25 s de desfase entre ellas (ciclo
2,4 s). Se para con reducir movimiento.

Según dónde aparece (**decisión del usuario**: nada debe distraer durante una reunión):
- **Continua** en la pantalla de acceso/registro y en la de carga.
- **Un solo saludo** al aparecer en la barra lateral y en el modo reunión: un ciclo de
  oscilación y uno de ondas; después queda quieto, con las ondas a opacidad completa.

El componente del logo recibe una opción para elegir entre `continuous` y `once`.

Sustituye a `IconWave` en `Brand`, en la pantalla de acceso (`AuthScreen`, que deja de usar
las barras de audio) y en el modo reunión. `IconWave` se borra si nadie más lo usa.

### Pantalla de carga (decisión aprobada en lo visual)

Contenido, centrado: la mano animada (~300 px) con tres anillos ámbar suaves que se expanden
detrás; «SeñaVoz»; el lema «Tus señas, con voz en cualquier reunión.»; una barra de progreso;
la lista de pasos; y la nota «Todo se procesa en este equipo. Tu cámara no sale de aquí.».
La barra y los pasos usan `role="status"` y `aria-live="polite"`; la mano es decorativa
(`aria-hidden`).

**Construcción de la mano animada** (lo que evita las líneas solapadas). La mano se arma por
partes y cada parte se pinta dos veces: primero un trazo grueso claro y, encima, uno fino del
color del fondo. Así solo queda visible el contorno de la silueta.

- Dedos: segmentos con punta redonda desde su base hasta la punta. Bases en x = 25,5 / 38,5 /
  51,5 / 64,5, y = 62. Trazo exterior 17 (`--text`), interior 9 (`--bg`).
- Palma: `M21 56 V88 A16 16 0 0 0 37 104 H63 A16 16 0 0 0 79 88 V64 Q79 56 69 56 Z`;
  exterior relleno y trazo 8 en `--text`, interior relleno `--bg`.
- Orden de pintado: los 4 dedos (exterior) → palma (exterior) → palma (interior) → los 4 dedos
  (interior) → pulgar (exterior) → pulgar (interior). El pulgar va al final para verse
  encima de la palma.
- Todo desplazado 6 px hacia abajo.
- Lleva las tres ondas del logo, desplazadas 12 px a la derecha y 6 px hacia abajo. No
  oscilan con la mano, pero sí se encienden por turnos como en el logo (ciclo de 2,4 s). Con
  reducir movimiento quedan a opacidad completa.

Posturas (ángulo respecto a la vertical en grados, largo); pulgar = [base x, base y, ángulo,
largo]:

| Postura | Dedos de izquierda a derecha | Pulgar |
|---|---|---|
| Abierta (como el logo) | (0,32) (0,46) (0,52) (0,40) | [80, 68, −90, 28] |
| Abanico | (−14,30) (−5,44) (4,50) (13,38) | [76, 74, 50, 26] |
| Puño | (0,10) ×4 | [74, 76, −8, 26] |
| «L» | (0,10) (0,10) (0,10) (−3,48) | [76, 74, 65, 26] |
| «V» | (0,10) (0,10) (−8,50) (10,46) | [80, 68, −90, 28] |

Ciclo: cada postura se mantiene 800 ms y la transición a la siguiente dura 500 ms, con easing
cúbico de entrada y salida; después de «V» vuelve a «Abierta». Además, la mano oscila ±3° en
5 s. Con reducir movimiento se queda en «Abierta», sin anillos.

**Cuándo aparece**: **solo al arrancar la app** (**decisión del usuario**). Después de iniciar
sesión o registrarse **no** vuelve a salir: se entra directamente a la Cámara con la
transición entre pantallas (ver «Transiciones entre pantallas»), y el panel Estado de la
Cámara muestra «Cargando modelo…» como hoy.

**Pasos** (*decisión mía*, porque el prototipo usaba pasos de ejemplo):

1. «Comprobando tu sesión»: hecho cuando `useSession.status` deja de ser `loading`.
2. «Cargando el modelo de señas»: hecho cuando `useSignModel.status` ya no es `loading`. Si es
   `error`, cuenta como terminado y la app sigue; la pantalla Cámara ya muestra ese estado.
3. «Cargando tus frases»: hecho cuando `usePhrases` tiene datos o ha fallado.

Si al arrancar hay sesión guardada, se muestran los tres pasos. Para eso la pantalla tiene que
seguir visible por encima de `AppLayout`, que es donde empiezan a cargarse el modelo y las
frases. Si no hay sesión, solo se muestra el paso 1 y después se va al acceso. La síntesis de
voz (`useVoicePreload`) **no** bloquea: sigue en segundo plano como hoy. La pantalla se
muestra al menos 1,2 s, para que no sea un parpadeo, y sale con un fundido de 300 ms.
Sustituye a `Splash` en todos sus usos.

### Cámara como pantalla principal (decisión aprobada en lo visual)

- La ruta por defecto pasa de `/frases` a `/camara` (comodín, `RequireGuest` y tras el acceso).
- Navegación en este orden: **Señas** (la Cámara, con un icono de mano), **Frases**,
  **Ajustes**. El texto `nav.camera` cambia a «Señas». La ruta sigue siendo `/camara`.
- Título «Tus manos hablan» y subtítulo actual («Haz las señas frente a la cámara. Todo se
  procesa en este equipo.»).
- Distribución: vídeo grande a la izquierda; a la derecha, «Lo que has dicho» (antes «Últimas
  señas») y «Estado»; debajo, una fila de **frases rápidas** con su número (1–9), que dicen la
  frase al pulsarlas, igual que en Frases. Los atajos 1–9 ya funcionan en la app; en esta
  pantalla se añaden con `usePhraseShortcuts`.
- Banda ámbar grande sobre la parte baja del vídeo; sustituye a la `signBanner` actual
  (*decisión mía*, la misma lógica que la pantalla Frases). Toma sus datos de `usePlayback`
  (`lastText`, `playing`), así que muestra lo que suena, venga de una seña o de una frase
  rápida. Mientras suena dice «Sonando ahora» y tiene el botón «Detener». Cuando termina o se
  detiene, se queda con la etiqueta «Lo último que dijiste». No aparece hasta que se dice la
  primera frase. Si cambia la frase, la nueva entra con animación.
- «Lo que has dicho» recoge todo lo que se dice desde esta pantalla, por seña o por frase
  rápida: las últimas 5, la más reciente arriba y resaltada.
- La pantalla Frases se queda como está, con la paleta y las animaciones nuevas.
- El panel Diagnóstico de desarrollo se queda donde está.

### Animaciones de componentes (decisión mía en la herramienta)

Librería: **`motion`** (paquete `motion`, import `motion/react`), para:
- Entrada escalonada de paneles al abrir una pantalla: aparición más 10 px hacia arriba, 0,6 s,
  con 80 ms de desfase.
- Elementos que entran o salen de una lista: «Lo que has dicho» (el nuevo entra deslizando
  desde la izquierda) y la banda «Sonando ahora».
- Fundido de salida de la pantalla de carga.

`<MotionConfig reducedMotion="user">` en la raíz, para que respete «reducir movimiento».
Hover y pulsación (botones y tarjetas que suben 2 px, navegación) van en CSS con `transition`,
sin librería. Duraciones de 150 a 600 ms; nada rebota.

La mano de carga se anima con `requestAnimationFrame` en un componente propio (calcula los
trazos cada fotograma y no necesita librería), con la geometría en un módulo puro y probado.
El punto que indica «activo» pulsa en menta con CSS.

### Transiciones entre pantallas (decisión del usuario)

El paso de una pantalla a otra es suave, sin cortes, y se hace con `AnimatePresence` de
`motion`, usando la ruta como clave:
- Acceso ↔ registro, acceso → Cámara (tras iniciar sesión), cerrar sesión → acceso, y la
  salida de la pantalla de carga.
- Entre Señas, Frases y Ajustes, la barra lateral **se queda fija** y solo cambia el
  contenido.
- La pantalla saliente se desvanece y la entrante aparece con un desplazamiento de 8 px hacia
  arriba, en unos 250 ms. No debe sentirse lento: se puede usar la app en cuanto aparece la
  pantalla.
- Con reducir movimiento, el cambio es instantáneo.
- La ventana del modo reunión es aparte y queda fuera de esto.

### Otras pantallas

Acceso/registro, Ajustes, Frases y modo reunión: solo cambian por la paleta, el logo nuevo y
las animaciones de entrada y hover. No se rediseñan.

## Lo que queda a criterio del implementador

- Organización en componentes (p. ej. `ui/Logo.tsx`, `ui/LoadingScreen.tsx`, `ui/handPoses.ts`).
- Ajustes finos de color secundario, siempre con contraste ≥ 4,5:1.
- Cómo verificar en pruebas la animación (se recomienda probar la geometría pura y que con
  reducir movimiento no se arranca `requestAnimationFrame`).
- Opcional, si sale barato: regenerar `desktop/resources/icon.png` con el logo nuevo sobre una
  placa ámbar.
