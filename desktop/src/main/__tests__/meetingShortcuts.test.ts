import { describe, expect, it, vi } from 'vitest';

import { createMeetingShortcuts, MEETING_ACCELERATORS } from '../meetingShortcuts';

function fakeRegistry(taken: string[] = []) {
  const handlers = new Map<string, () => void>();
  return {
    handlers,
    register: vi.fn((accel: string, cb: () => void) => {
      if (taken.includes(accel)) return false;
      handlers.set(accel, cb);
      return true;
    }),
    unregister: vi.fn((accel: string) => void handlers.delete(accel)),
  };
}

describe('atajos de reunión', () => {
  it('registra Ctrl+Alt+1…9 y cada uno envía su índice', () => {
    const reg = fakeRegistry();
    const onPhrase = vi.fn();
    expect(createMeetingShortcuts(reg, onPhrase).register()).toEqual([]);
    expect([...reg.handlers.keys()]).toEqual(MEETING_ACCELERATORS);
    expect(MEETING_ACCELERATORS[0]).toBe('Control+Alt+1');
    reg.handlers.get('Control+Alt+3')!();
    expect(onPhrase).toHaveBeenCalledWith(2);
  });

  it('devuelve los atajos ocupados por otra app y registra el resto', () => {
    const reg = fakeRegistry(['Control+Alt+2']);
    expect(createMeetingShortcuts(reg, vi.fn()).register()).toEqual(['Control+Alt+2']);
    expect(reg.handlers.size).toBe(8);
  });

  it('unregister libera solo los que registró', () => {
    const reg = fakeRegistry(['Control+Alt+2']);
    const sc = createMeetingShortcuts(reg, vi.fn());
    sc.register();
    sc.unregister();
    expect(reg.handlers.size).toBe(0);
    expect(reg.unregister).toHaveBeenCalledTimes(8);
  });
});
