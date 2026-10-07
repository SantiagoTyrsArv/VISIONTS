import { describe, expect, it } from 'vitest';

import { LandmarkSequenceBuffer, normalizeHandLandmarks } from './landmarks';

const hand = (
  offset: number,
  handedness?: 'Left' | 'Right',
): { handedness?: 'Left' | 'Right'; landmarks: { x: number; y: number; z: number }[] } => ({
  handedness,
  landmarks: Array.from({ length: 21 }, (_, index) => ({
    x: offset + index,
    y: offset + index * 2,
    z: offset - index,
  })),
});

describe('normalizeHandLandmarks', () => {
  it('resta el punto de la muñeca y completa los 126 valores con ceros', () => {
    const frame = normalizeHandLandmarks([hand(10, 'Right')]);

    expect(frame).toHaveLength(126);
    expect(frame.slice(0, 6)).toEqual([0, 0, 0, 1, 2, -1]);
    expect(frame.slice(63)).toEqual(Array(63).fill(0));
  });

  it('ordena izquierda antes que derecha para mantener posiciones estables', () => {
    const frame = normalizeHandLandmarks([hand(100, 'Right'), hand(10, 'Left')]);

    expect(frame.slice(3, 6)).toEqual([1, 2, -1]);
    expect(frame.slice(66, 69)).toEqual([1, 2, -1]);
    expect(frame[0]).toBe(0);
    expect(frame[63]).toBe(0);
  });

  it('ignora manos mal formadas sin cambiar el tamaño del vector', () => {
    expect(normalizeHandLandmarks([{ landmarks: [] }])).toEqual(Array(126).fill(0));
  });
});

describe('LandmarkSequenceBuffer', () => {
  it('espera 30 frames y mantiene una ventana fija de 30 × 126', () => {
    const buffer = new LandmarkSequenceBuffer();

    for (let i = 0; i < 29; i += 1) buffer.add([]);
    expect(buffer.isReady).toBe(false);
    buffer.add([]);

    expect(buffer.isReady).toBe(true);
    expect(buffer.toArray()).toHaveLength(30 * 126);
  });

  it('conserva solo los 30 frames más recientes', () => {
    const buffer = new LandmarkSequenceBuffer();
    for (let i = 0; i < 31; i += 1) {
      const landmarks = Array.from({ length: 21 }, (_, j) => ({ x: i + j * i, y: 0, z: 0 }));
      buffer.add([{ landmarks }]);
    }

    expect(buffer.toArray()).toHaveLength(30 * 126);
    expect(buffer.toArray()[3]).toBe(1);
    expect(buffer.toArray().at(-123)).toBe(30);
  });
});
