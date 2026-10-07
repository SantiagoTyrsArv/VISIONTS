export type Landmark3D = { x: number; y: number; z: number };
export type Handedness = 'Left' | 'Right';
export type DetectedHand = { landmarks: Landmark3D[]; handedness?: Handedness };

export const LANDMARKS_PER_HAND = 21;
export const VALUES_PER_HAND = LANDMARKS_PER_HAND * 3;
export const MAX_HANDS = 2;
export const VALUES_PER_FRAME = VALUES_PER_HAND * MAX_HANDS;
export const SEQUENCE_LENGTH = 30;

const zeroHand = (): number[] => Array<number>(VALUES_PER_HAND).fill(0);

/** Returns a stable 126-value frame, left hand first, translated to each wrist. */
export function normalizeHandLandmarks(hands: readonly DetectedHand[]): number[] {
  const ordered = [...hands]
    .filter((hand) => hand.landmarks.length === LANDMARKS_PER_HAND)
    .slice(0, MAX_HANDS)
    .sort((a, b): number => {
      const order = (hand: DetectedHand): number =>
        hand.handedness === 'Left' ? 0 : hand.handedness === 'Right' ? 1 : 2;
      return order(a) - order(b);
    });

  const normalized = ordered.map((hand) => {
    if (hand.landmarks.some(({ x, y, z }) => !Number.isFinite(x + y + z))) return zeroHand();
    const wrist = hand.landmarks[0];
    return hand.landmarks.flatMap(({ x, y, z }) => [x - wrist.x, y - wrist.y, z - wrist.z]);
  });

  while (normalized.length < MAX_HANDS) normalized.push(zeroHand());
  return normalized.flat();
}

/** Keeps the latest 30 normalized frames for temporal classifiers. */
export class LandmarkSequenceBuffer {
  private readonly frames: number[][] = [];

  get isReady(): boolean {
    return this.frames.length === SEQUENCE_LENGTH;
  }

  add(hands: readonly DetectedHand[]): number[] {
    this.frames.push(normalizeHandLandmarks(hands));
    if (this.frames.length > SEQUENCE_LENGTH) this.frames.shift();
    return this.frames[this.frames.length - 1];
  }

  toArray(): number[] {
    return this.frames.flat();
  }

  clear(): void {
    this.frames.length = 0;
  }
}
