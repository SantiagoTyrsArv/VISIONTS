import { create } from 'zustand';

import { GruModel } from '@/services/recognition/GruModel';
import { createSignClassifier, type SignClassifier } from '@/services/recognition/SignClassifier';
import { FRAME_INTERVAL_MS, SEQUENCE_LENGTH } from '@/services/recognition/landmarks';

const NEUTRAL = 'neutral';
// Una seña puede seguir dentro de la ventana (≈ 2 s) tras reconocerse: no se repite antes.
const COOLDOWN_MS = SEQUENCE_LENGTH * FRAME_INTERVAL_MS;

type SignModelState = {
  status: 'loading' | 'ready' | 'error';
  classifier: SignClassifier | null;
  labels: string[];
  valAccuracy: number | null;
  load: (loader?: () => Promise<unknown>) => Promise<void>;
};

// Import dinámico: el JSON (≈ 300 KB) no retrasa el primer render. Lo genera training/ y no
// existe en un clon recién hecho: con glob su ausencia no rompe typecheck, tests ni `npm run dev`
// (la app queda en "no disponible"); `build:win` sí lo exige (scripts/check-sign-model.mjs).
const modelChunks = import.meta.glob<unknown>('../assets/sign-model.json', { import: 'default' });
const bundledModel = async (): Promise<unknown> => {
  const chunk = Object.values(modelChunks)[0];
  if (!chunk) throw new Error('sign-model.json no está en la app');
  return chunk();
};

/** Etiquetas que producen frase (todas salvo neutral). */
export const signLabels = (s: Pick<SignModelState, 'labels'>): string[] =>
  s.labels.filter((l) => l !== NEUTRAL);

/** Modelo LSC global, empaquetado con la app: se carga una vez, sin red ni sesión. */
export const useSignModel = create<SignModelState>()((set) => ({
  status: 'loading',
  classifier: null,
  labels: [],
  valAccuracy: null,
  async load(loader = bundledModel) {
    try {
      const json = await loader();
      const model = GruModel.fromJson(json);
      // Las etiquetas son los `code` de las frases; `neutral` no está en el mapa.
      const labelToCode = Object.fromEntries(
        model.labels.filter((l) => l !== NEUTRAL).map((l) => [l, l]),
      );
      const acc = (json as { metrics?: { val_accuracy?: unknown } }).metrics?.val_accuracy;
      set({
        status: 'ready',
        classifier: createSignClassifier(model, labelToCode, { cooldownMs: COOLDOWN_MS }),
        labels: [...model.labels],
        valAccuracy: typeof acc === 'number' ? acc : null,
      });
    } catch {
      set({ status: 'error', classifier: null, labels: [], valAccuracy: null });
    }
  },
}));
