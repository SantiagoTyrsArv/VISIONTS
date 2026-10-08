import { create } from 'zustand';

type PlaybackState = {
  /** Última frase dicha (por clic, atajo o seña). */
  lastText: string | null;
  /** Hay audio sonando: se muestra porque el usuario no lo oye. */
  playing: boolean;
  /** Generando los audios del catálogo. */
  preparing: boolean;
  synthError: boolean;
  spoke: (text: string) => void;
  setPlaying: (playing: boolean) => void;
  setPreparing: (preparing: boolean) => void;
  setSynthError: (synthError: boolean) => void;
};

export const usePlayback = create<PlaybackState>()((set) => ({
  lastText: null,
  playing: false,
  preparing: false,
  synthError: false,
  spoke: (lastText) => set({ lastText, synthError: false }),
  setPlaying: (playing) => set({ playing }),
  setPreparing: (preparing) => set({ preparing }),
  setSynthError: (synthError) => set({ synthError }),
}));
