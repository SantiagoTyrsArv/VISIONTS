import { create } from 'zustand';

import type { ClassProbabilities } from '@/services/recognition/diagnostics';

type SignDiagnosticsState = {
  /** Última lectura del modelo; null si no se ha ejecutado (sin manos en la ventana). */
  probabilities: ClassProbabilities | null;
  update: (probabilities: ClassProbabilities) => void;
  clear: () => void;
};

/** Lo que ve el modelo en cada momento. Solo se llena en desarrollo (ver signModel.ts). */
export const useSignDiagnostics = create<SignDiagnosticsState>()((set) => ({
  probabilities: null,
  update: (probabilities) => set({ probabilities }),
  clear: () => set({ probabilities: null }),
}));
