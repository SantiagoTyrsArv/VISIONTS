export type Rect = { x: number; y: number; width: number; height: number };

/** Lo que el controlador usa de BrowserWindow (permite probarlo sin Electron). */
export type MeetingWin = {
  getBounds(): Rect;
  setBounds(bounds: Rect): void;
  setMinimumSize(width: number, height: number): void;
  setAlwaysOnTop(flag: boolean, level?: 'floating'): void;
  isMaximized(): boolean;
  unmaximize(): void;
  maximize(): void;
};

const COMPACT = { width: 380, height: 600, minWidth: 340, minHeight: 520 };
const NORMAL_MIN = { width: 900, height: 600 };
const MARGIN = 16;

const inside = (r: Rect, area: Rect) =>
  r.x >= area.x &&
  r.y >= area.y &&
  r.x + r.width <= area.x + area.width &&
  r.y + r.height <= area.y + area.height;

/** Límites de la ventana compacta: la posición guardada si cabe; si no, abajo a la derecha. */
export function compactBounds(workArea: Rect, saved: Rect | null): Rect {
  if (saved && inside(saved, workArea)) return saved;
  const width = Math.min(COMPACT.width, workArea.width);
  const height = Math.min(COMPACT.height, workArea.height);
  return {
    x: Math.max(workArea.x, workArea.x + workArea.width - width - MARGIN),
    y: Math.max(workArea.y, workArea.y + workArea.height - height - MARGIN),
    width,
    height,
  };
}

export function parseRect(v: unknown): Rect | null {
  if (typeof v !== 'object' || v === null) return null;
  const { x, y, width, height } = v as Record<string, unknown>;
  return [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))
    ? { x: x as number, y: y as number, width: width as number, height: height as number }
    : null;
}

export type MeetingWindowDeps = {
  win: MeetingWin;
  workArea: () => Rect;
  load: () => Promise<Rect | null>;
  save: (compact: Rect) => Promise<void>;
};

/** Transforma la única ventana de la app en la compacta "siempre visible" y la restaura. */
export function createMeetingWindow({ win, workArea, load, save }: MeetingWindowDeps) {
  let previous: { bounds: Rect; maximized: boolean } | null = null;

  return {
    get active() {
      return previous !== null;
    },
    async enter() {
      if (previous) return;
      previous = { bounds: win.getBounds(), maximized: win.isMaximized() };
      if (previous.maximized) {
        win.unmaximize();
        // unmaximize restaura los límites previos a maximizar; se guardan esos.
        previous.bounds = win.getBounds();
      }
      win.setMinimumSize(COMPACT.minWidth, COMPACT.minHeight);
      win.setBounds(compactBounds(workArea(), await load()));
      win.setAlwaysOnTop(true, 'floating');
    },
    /** Guarda dónde dejó el usuario la ventana compacta. */
    async saveCompact() {
      if (previous) await save(win.getBounds());
    },
    async exit() {
      if (!previous) return;
      await save(win.getBounds());
      const { bounds, maximized } = previous;
      previous = null;
      win.setAlwaysOnTop(false);
      win.setMinimumSize(NORMAL_MIN.width, NORMAL_MIN.height);
      win.setBounds(bounds);
      if (maximized) win.maximize();
    },
  };
}
