import { afterEach, describe, expect, it, vi } from 'vitest';

import { loopTrace } from './eventLoopTrace';

let disconnect: (() => void) | null = null;
afterEach(() => disconnect?.());

describe('loopTrace', () => {
  it('sin panel conectado no registra nada', () => {
    loopTrace.begin(0);
    loopTrace.mark('then', 'microtask', 5);
    expect(loopTrace.active).toBe(false);
  });

  it('publica los pasos ordenados y relativos al inicio del frame', () => {
    const publish = vi.fn();
    disconnect = loopTrace.connect(publish);
    loopTrace.begin(100);
    loopTrace.mark('then', 'microtask', 112);
    loopTrace.mark('frame', 'task', 100, 108);
    loopTrace.mark('workerInfer', 'worker', 109, 110.5);
    loopTrace.mark('message', 'task', 111, 111.2);
    loopTrace.end(112);

    const [{ steps, total }] = publish.mock.calls[0];
    expect(steps.map((s: { id: string }) => s.id)).toEqual([
      'frame',
      'workerInfer',
      'message',
      'then',
    ]);
    expect(steps[0]).toEqual({ id: 'frame', kind: 'task', start: 0, duration: 8 });
    expect(steps[1].duration).toBeCloseTo(1.5);
    expect(total).toBe(12);
  });

  it('limita la publicación para no repintar el panel en cada frame', () => {
    const publish = vi.fn();
    disconnect = loopTrace.connect(publish);
    for (const t of [10_000, 10_100, 10_300]) {
      loopTrace.begin(t);
      loopTrace.end(t + 1);
    }
    expect(publish).toHaveBeenCalledTimes(2); // 10 001 y 10 301; 10 101 cae en el intervalo
  });
});
