/** Geometría de la mano que signa: posturas, interpolación y trazados SVG. */

export type HandPose = {
  /** Dedos de izquierda a derecha: [ángulo°, largo]. */
  fingers: readonly [number, number][];
  /** Pulgar: [x, y, ángulo°, largo]. */
  thumb: readonly [number, number, number, number];
};

export const FINGER_BASES = [25.5, 38.5, 51.5, 64.5] as const;
export const FINGER_BASE_Y = 62;
export const HOLD_MS = 800;
export const TRANSITION_MS = 500;

/** Abierta, Abanico, Puño, «L» y «V», en el orden del ciclo. */
export const POSES: readonly HandPose[] = [
  {
    fingers: [
      [0, 32],
      [0, 46],
      [0, 52],
      [0, 40],
    ],
    thumb: [80, 68, -90, 28],
  },
  {
    fingers: [
      [-14, 30],
      [-5, 44],
      [4, 50],
      [13, 38],
    ],
    thumb: [76, 74, 50, 26],
  },
  {
    fingers: [
      [0, 10],
      [0, 10],
      [0, 10],
      [0, 10],
    ],
    thumb: [74, 76, -8, 26],
  },
  {
    fingers: [
      [0, 10],
      [0, 10],
      [0, 10],
      [-3, 48],
    ],
    thumb: [76, 74, 65, 26],
  },
  {
    fingers: [
      [0, 10],
      [0, 10],
      [-8, 50],
      [10, 46],
    ],
    thumb: [80, 68, -90, 28],
  },
];

const PERIODO_MS = HOLD_MS + TRANSITION_MS;

/** Un decimal como mucho, sin «-0». */
function redondea(n: number): string {
  return String(Number(n.toFixed(1)) + 0);
}

/** Segmento desde (x, y); el ángulo se mide desde la vertical, positivo a la derecha. */
export function segmentPath(x: number, y: number, angleDeg: number, length: number): string {
  const rad = (angleDeg * Math.PI) / 180;
  const x2 = x + Math.sin(rad) * length;
  const y2 = y - Math.cos(rad) * length;
  return `M${redondea(x)} ${redondea(y)} L${redondea(x2)} ${redondea(y2)}`;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Postura en el instante dado: se mantiene HOLD_MS y transita TRANSITION_MS a la siguiente. Cíclica. */
export function poseAt(timeMs: number): HandPose {
  const total = PERIODO_MS * POSES.length;
  const t = ((timeMs % total) + total) % total;
  const i = Math.floor(t / PERIODO_MS);
  const dentro = t - i * PERIODO_MS;
  const desde = POSES[i];
  if (dentro < HOLD_MS) return desde;
  const k = easeInOutCubic((dentro - HOLD_MS) / TRANSITION_MS);
  const hasta = POSES[(i + 1) % POSES.length];
  return {
    fingers: desde.fingers.map(([a, l], j) => [
      lerp(a, hasta.fingers[j][0], k),
      lerp(l, hasta.fingers[j][1], k),
    ]),
    thumb: desde.thumb.map((v, j) => lerp(v, hasta.thumb[j], k)) as unknown as HandPose['thumb'],
  };
}

export function handPaths(pose: HandPose): { fingers: string[]; thumb: string } {
  const [tx, ty, ta, tl] = pose.thumb;
  return {
    fingers: pose.fingers.map(([a, l], i) => segmentPath(FINGER_BASES[i], FINGER_BASE_Y, a, l)),
    thumb: segmentPath(tx, ty, ta, tl),
  };
}
