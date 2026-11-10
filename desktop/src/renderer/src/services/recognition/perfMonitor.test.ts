import { describe, expect, it } from 'vitest';
import type { INPMetricWithAttribution } from 'web-vitals/attribution';

import { EMPTY_LONG_TASKS, addLongTasks, toInpReading } from './perfMonitor';

describe('addLongTasks', () => {
  it('acumula cantidad, total, la peor y las últimas (la más reciente primero)', () => {
    const stats = addLongTasks(EMPTY_LONG_TASKS, [
      { start: 10, duration: 60 },
      { start: 200, duration: 120 },
    ]);
    expect(stats).toMatchObject({ count: 2, totalMs: 180, worstMs: 120, lastStart: 200 });
    expect(stats.recent.map((t) => t.start)).toEqual([200, 10]);
  });

  it('no cuenta dos veces las que el observador repite con buffered', () => {
    const once = addLongTasks(EMPTY_LONG_TASKS, [{ start: 10, duration: 60 }]);
    const again = addLongTasks(once, [
      { start: 10, duration: 60 },
      { start: 300, duration: 55 },
    ]);
    expect(again.count).toBe(2);
    expect(addLongTasks(again, [{ start: 10, duration: 60 }])).toBe(again);
  });
});

describe('toInpReading', () => {
  it('resume la atribución de web-vitals y anota en qué hilo corría la GRU', () => {
    const metric = {
      value: 184,
      rating: 'needs-improvement',
      attribution: {
        interactionTarget: 'button.quick',
        interactionType: 'pointer',
        inputDelay: 96,
        processingDuration: 40,
        presentationDelay: 48,
      },
    } as unknown as INPMetricWithAttribution;
    expect(toInpReading(metric, 'main', new Date('2026-11-09T12:00:00Z'))).toEqual({
      value: 184,
      rating: 'needs-improvement',
      target: 'button.quick',
      type: 'pointer',
      inputDelay: 96,
      processingDuration: 40,
      presentationDelay: 48,
      thread: 'main',
      measuredAt: '2026-11-09T12:00:00.000Z',
    });
  });
});
