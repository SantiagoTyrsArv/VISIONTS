import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BurstRecorder, type BurstEvent } from './burstRecorder';

const frame = (handsDetected: boolean, v = 0.1) => ({
  values: Array<number>(126).fill(v),
  handsDetected,
});

function feed(rec: BurstRecorder, n: number, hands = true) {
  for (let i = 0; i < n; i += 1) rec.addFrame(frame(hands));
}

let events: BurstEvent[];
beforeEach(() => {
  vi.useFakeTimers();
  events = [];
});
afterEach(() => vi.useRealTimers());

describe('BurstRecorder', () => {
  it('cuenta atrás 3-2-1 y luego graba; ignora frames durante la cuenta', () => {
    const rec = new BurstRecorder((e) => events.push(e), { requireHands: true });
    rec.start();
    feed(rec, 40);
    expect(events).toEqual([{ type: 'countdown', secondsLeft: 3 }]);
    vi.advanceTimersByTime(3000);
    expect(events.slice(1)).toEqual([
      { type: 'countdown', secondsLeft: 2 },
      { type: 'countdown', secondsLeft: 1 },
      { type: 'recording', burst: 1 },
    ]);
  });

  it('emite una muestra de 3.780 valores al reunir 30 frames', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: true,
      countdownSeconds: 0,
    });
    rec.start();
    feed(rec, 30);
    const sample = events.find((e) => e.type === 'sample');
    expect(sample && sample.type === 'sample' && sample.frames).toHaveLength(3780);
  });

  it('descarta una ráfaga con manos en menos de 15 frames', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: true,
      countdownSeconds: 0,
    });
    rec.start();
    feed(rec, 16, false);
    feed(rec, 14, true);
    expect(events.some((e) => e.type === 'sample')).toBe(false);
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
  });

  it('en reposo acepta ráfagas sin manos', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: false,
      countdownSeconds: 0,
    });
    rec.start();
    feed(rec, 30, false);
    expect(events.some((e) => e.type === 'sample')).toBe(true);
  });

  it('hace 5 ráfagas con pausa de 1 s entre ellas y termina', () => {
    const rec = new BurstRecorder((e) => events.push(e), {
      requireHands: true,
      countdownSeconds: 0,
    });
    rec.start();
    for (let i = 0; i < 5; i += 1) {
      feed(rec, 30);
      feed(rec, 10); // durante la pausa no cuenta
      vi.advanceTimersByTime(1000);
    }
    expect(events.filter((e) => e.type === 'sample')).toHaveLength(5);
    expect(events.at(-1)).toEqual({ type: 'done' });
    expect(rec.running).toBe(false);
  });

  it('stop() cancela la cuenta atrás y no emite más eventos', () => {
    const rec = new BurstRecorder((e) => events.push(e), { requireHands: true });
    rec.start();
    rec.stop();
    vi.advanceTimersByTime(5000);
    feed(rec, 30);
    expect(events).toEqual([{ type: 'countdown', secondsLeft: 3 }]);
    expect(rec.running).toBe(false);
  });
});
