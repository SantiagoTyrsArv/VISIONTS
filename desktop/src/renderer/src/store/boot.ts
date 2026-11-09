import { create } from 'zustand';

type BootState = {
  /** La capa de arranque está a la vista: lo de debajo no responde (ni a los atajos 1–9). */
  booting: boolean;
};

export const useBoot = create<BootState>()(() => ({ booting: false }));
