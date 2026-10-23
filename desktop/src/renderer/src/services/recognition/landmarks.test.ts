import { describe, expect, it } from 'vitest';

import parity from './__fixtures__/landmarks-parity.json';
import {
  HAND_HOLD_FRAMES,
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
    // Escalar los tres ejes a la vez no debe cambiar el resultado normalizado.
    const base = hand(0.5, 0.5, 1);
    const big = base.map(({ x, y, z }) => ({ x: x * 3, y: y * 3, z: z * 3 }));
    const small = normalizeHand(base)!;
    const scaled = normalizeHand(big)!;
    small.forEach((v, i) => expect(v).toBeCloseTo(scaled[i], 6));
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

  it('conserva solo los 30 frames más recientes', () => {
    const buffer = new LandmarkSequenceBuffer();
    buffer.add([{ landmarks: hand(0.4, 0.5), handedness: 'Left' }]);
    for (let i = 0; i < SEQUENCE_LENGTH + 4; i += 1) buffer.add([]);
    buffer.add([{ landmarks: hand(0.6, 0.5), handedness: 'Right' }]);
    const frames = buffer.frames();
    expect(frames).toHaveLength(SEQUENCE_LENGTH);
    // La primera mano ya salió de la ventana.
    expect(frames[0].every((v) => v === 0)).toBe(true);
    expect(
      frames
        .at(-1)!
        .slice(63)
        .some((v) => v !== 0),
    ).toBe(true);
  });

  it('mantiene la última mano vista durante HAND_HOLD_FRAMES frames', () => {
    const buffer = new LandmarkSequenceBuffer();
    const left: DetectedHand = { landmarks: hand(0.4, 0.5), handedness: 'Left' };
    buffer.add([left]);
    for (let i = 0; i < HAND_HOLD_FRAMES; i += 1) buffer.add([]);
    const frames = buffer.frames();
    const kept = frames[frames.length - 1];
    expect(kept.slice(0, 63)).toEqual(frames[0].slice(0, 63));
    buffer.add([]);
    expect(
      buffer
        .frames()
        .at(-1)!
        .slice(0, 63)
        .every((v) => v === 0),
    ).toBe(true);
  });

  it('indica si alguna mano aparece en la ventana', () => {
    const buffer = new LandmarkSequenceBuffer();
    for (let i = 0; i < SEQUENCE_LENGTH; i += 1) buffer.add([]);
    expect(buffer.hasHands()).toBe(false);
    buffer.add([{ landmarks: hand(0.4, 0.5), handedness: 'Left' }]);
    expect(buffer.hasHands()).toBe(true);
  });

  it('mantiene también la mano Right y reinicia la cuenta al reaparecer', () => {
    const buffer = new LandmarkSequenceBuffer();
    const right: DetectedHand = { landmarks: hand(0.6, 0.5), handedness: 'Right' };
    buffer.add([right]);
    for (let i = 0; i < HAND_HOLD_FRAMES - 1; i += 1) buffer.add([]);
    buffer.add([right]); // reaparece: la cuenta de perdidos vuelve a 0
    for (let i = 0; i < HAND_HOLD_FRAMES; i += 1) buffer.add([]);
    const frames = buffer.frames();
    const shown = frames[frames.length - HAND_HOLD_FRAMES - 1].slice(63);
    expect(frames.at(-1)!.slice(63)).toEqual(shown);
    expect(
      frames
        .at(-1)!
        .slice(0, 63)
        .every((v) => v === 0),
    ).toBe(true);
    buffer.add([]);
    expect(
      buffer
        .frames()
        .at(-1)!
        .slice(63)
        .every((v) => v === 0),
    ).toBe(true);
  });
});
