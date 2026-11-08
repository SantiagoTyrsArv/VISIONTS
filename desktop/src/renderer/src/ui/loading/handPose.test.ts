import { describe, expect, it } from 'vitest';

import {
  FINGER_BASES,
  handPaths,
  HOLD_MS,
  POSES,
  poseAt,
  segmentPath,
  TRANSITION_MS,
} from './handPose';

describe('geometría de la mano', () => {
  it('segmentPath mide el ángulo desde la vertical, positivo a la derecha', () => {
    expect(segmentPath(25.5, 62, 0, 32)).toBe('M25.5 62 L25.5 30');
    expect(segmentPath(80, 68, -90, 28)).toBe('M80 68 L52 68');
  });

  it('segmentPath usa como mucho un decimal', () => {
    expect(segmentPath(0, 0, 30, 10)).toBe('M0 0 L5 -8.7');
  });

  it('tiene las 5 posturas con 4 dedos y 4 bases', () => {
    expect(POSES).toHaveLength(5);
    expect(FINGER_BASES).toHaveLength(4);
    for (const p of POSES) expect(p.fingers).toHaveLength(4);
  });

  it('mantiene cada postura y luego transita con easing', () => {
    const periodo = HOLD_MS + TRANSITION_MS;
    expect(periodo).toBe(1300);
    expect(poseAt(0)).toEqual(POSES[0]);
    expect(poseAt(799)).toEqual(POSES[0]);
    expect(poseAt(1300)).toEqual(POSES[1]);
    expect(poseAt(1050).fingers[0][0]).toBeCloseTo(-7);
    expect(poseAt(1300 * POSES.length)).toEqual(POSES[0]);
  });

  it('la última postura vuelve a la primera', () => {
    const t = 1300 * (POSES.length - 1) + HOLD_MS + TRANSITION_MS / 2;
    expect(poseAt(t).thumb[2]).toBeCloseTo((POSES[4].thumb[2] + POSES[0].thumb[2]) / 2);
  });

  it('handPaths devuelve 4 dedos y el pulgar', () => {
    const { fingers, thumb } = handPaths(POSES[0]);
    expect(fingers).toHaveLength(4);
    expect(fingers[0]).toBe('M25.5 62 L25.5 30');
    expect(thumb).toBe('M80 68 L52 68');
  });
});
