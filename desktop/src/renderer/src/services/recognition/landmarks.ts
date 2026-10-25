export type Landmark3D = { x: number; y: number; z: number };
export type Handedness = 'Left' | 'Right';
export type DetectedHand = { landmarks: Landmark3D[]; handedness?: Handedness };

export const LANDMARKS_PER_HAND = 21;
export const VALUES_PER_HAND = LANDMARKS_PER_HAND * 3;
export const MAX_HANDS = 2;
export const VALUES_PER_FRAME = VALUES_PER_HAND * MAX_HANDS;
export const SEQUENCE_LENGTH = 30;

const zeroHand = (): number[] => new Array<number>(VALUES_PER_HAND).fill(0);

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
  const valid = hands.filter((h) => h.landmarks.length === LANDMARKS_PER_HAND);
  for (const hand of valid) {
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

/** Un frame de cada 2 a 30 fps: 30 frames ≈ 2 s, la duración típica de una seña de LSC-54. */
export const FRAME_INTERVAL_MS = 66;
/** Frames que se mantiene una mano perdida, como el forward fill del dataset. */
export const HAND_HOLD_FRAMES = 3;

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

  /** Si alguna mano real (no solo mantenida) aparece en la ventana. */
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
