import { create } from 'zustand';

type MeetingState = {
  active: boolean;
  /** deviceId del micrófono virtual (lado de reproducción). */
  sinkId: string;
  /** El dispositivo desapareció: no se envía nada hasta que vuelva. */
  deviceMissing: boolean;
  paused: boolean;
  failedShortcuts: string[];
  start: (sinkId: string, failedShortcuts: string[]) => void;
  stop: () => void;
  setSink: (sinkId: string | null) => void;
  togglePause: () => void;
};

// No se persiste: la app siempre arranca fuera del Modo reunión.
export const useMeeting = create<MeetingState>()((set) => ({
  active: false,
  sinkId: '',
  deviceMissing: false,
  paused: false,
  failedShortcuts: [],
  start: (sinkId, failedShortcuts) =>
    set({ active: true, sinkId, deviceMissing: false, paused: false, failedShortcuts }),
  stop: () => set({ active: false, sinkId: '', deviceMissing: false, paused: false }),
  setSink: (sinkId) => set(sinkId ? { sinkId, deviceMissing: false } : { deviceMissing: true }),
  togglePause: () => set((s) => ({ paused: !s.paused })),
}));
