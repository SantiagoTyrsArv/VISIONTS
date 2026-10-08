import { describe, expect, it, vi } from 'vitest';

import {
  compactBounds,
  createMeetingWindow,
  parseRect,
  type MeetingWin,
  type Rect,
} from '../meetingWindow';

const work: Rect = { x: 0, y: 0, width: 1920, height: 1040 };

describe('compactBounds', () => {
  it('sin posición guardada, va a la esquina inferior derecha', () => {
    expect(compactBounds(work, null)).toEqual({ x: 1524, y: 424, width: 380, height: 600 });
  });

  it('reutiliza la posición guardada si cabe en la pantalla', () => {
    const saved = { x: 100, y: 100, width: 360, height: 560 };
    expect(compactBounds(work, saved)).toEqual(saved);
  });

  it('ignora la guardada si quedó fuera (p. ej. otro monitor desconectado)', () => {
    expect(compactBounds(work, { x: 2500, y: 100, width: 380, height: 600 })).toEqual(
      compactBounds(work, null),
    );
  });

  it('en una pantalla baja no se sale del área de trabajo', () => {
    const small = { x: 0, y: 0, width: 800, height: 500 };
    expect(compactBounds(small, null)).toEqual({ x: 404, y: 0, width: 380, height: 500 });
  });
});

describe('parseRect', () => {
  it('acepta un rectángulo y rechaza lo demás', () => {
    expect(parseRect({ x: 1, y: 2, width: 3, height: 4 })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4,
    });
    expect(parseRect({ x: 1 })).toBeNull();
    expect(parseRect(null)).toBeNull();
  });
});

function fakeWin(bounds: Rect, maximized = false) {
  let current = bounds;
  let isMax = maximized;
  const win = {
    getBounds: () => current,
    setBounds: vi.fn((r: Rect) => void (current = r)),
    setMinimumSize: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    isMaximized: () => isMax,
    unmaximize: vi.fn(() => void (isMax = false)),
    maximize: vi.fn(() => void (isMax = true)),
  };
  return win as typeof win & MeetingWin;
}

const noState = { load: async () => null, save: async () => {} };

describe('createMeetingWindow', () => {
  const normal = { x: 50, y: 50, width: 1100, height: 720 };

  it('entrar compacta y fija encima; salir restaura y guarda la posición compacta', async () => {
    const win = fakeWin(normal);
    const save = vi.fn(async () => {});
    const mw = createMeetingWindow({ win, workArea: () => work, load: async () => null, save });

    await mw.enter();
    expect(mw.active).toBe(true);
    expect(win.getBounds()).toEqual({ x: 1524, y: 424, width: 380, height: 600 });
    expect(win.setMinimumSize).toHaveBeenLastCalledWith(340, 520);
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(true, 'floating');

    await mw.exit();
    expect(mw.active).toBe(false);
    expect(save).toHaveBeenCalledWith({ x: 1524, y: 424, width: 380, height: 600 });
    expect(win.getBounds()).toEqual(normal);
    expect(win.setMinimumSize).toHaveBeenLastCalledWith(900, 600);
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });

  it('si estaba maximizada, al salir vuelve a maximizarse', async () => {
    const win = fakeWin(normal, true);
    const mw = createMeetingWindow({ win, workArea: () => work, ...noState });
    await mw.enter();
    expect(win.unmaximize).toHaveBeenCalled();
    await mw.exit();
    expect(win.maximize).toHaveBeenCalled();
  });

  it('entrar dos veces no pisa los límites originales', async () => {
    const win = fakeWin(normal);
    const mw = createMeetingWindow({ win, workArea: () => work, ...noState });
    await mw.enter();
    await mw.enter();
    await mw.exit();
    expect(win.getBounds()).toEqual(normal);
  });

  it('salir sin haber entrado no hace nada', async () => {
    const win = fakeWin(normal);
    const save = vi.fn(async () => {});
    await createMeetingWindow({ win, workArea: () => work, load: async () => null, save }).exit();
    expect(save).not.toHaveBeenCalled();
    expect(win.setBounds).not.toHaveBeenCalled();
  });
});
