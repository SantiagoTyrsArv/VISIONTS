import { create } from 'zustand';

import { GruModel } from '@/services/recognition/GruModel';
import {
  createSignClassifier,
  createSignPolicy,
  type SignClassifier,
} from '@/services/recognition/SignClassifier';
import { FRAME_INTERVAL_MS, SEQUENCE_LENGTH } from '@/services/recognition/landmarks';
import { LocalWindowModel } from '@/services/recognition/windowModels';
import type { WorkerSignModel } from '@/services/recognition/WorkerSignRecognizer';

import { useSignDiagnostics } from './signDiagnostics';

const NEUTRAL = 'neutral';
// Una seña puede seguir dentro de la ventana (≈ 2 s) tras reconocerse: no se repite antes.
const COOLDOWN_MS = SEQUENCE_LENGTH * FRAME_INTERVAL_MS;

type SignModelState = {
  status: 'loading' | 'ready' | 'error';
  /** GRU en el hilo principal (modo «antes» del panel Diagnóstico). */
  classifier: SignClassifier | null;
  /** Pesos para el worker y política para decidir la frase en el hilo principal. */
  workerModel: WorkerSignModel | null;
  labels: string[];
  valAccuracy: number | null;
  load: (loader?: () => Promise<unknown>) => Promise<void>;
};

// Import dinámico: el JSON (≈ 300 KB) no retrasa el primer render. Lo genera training/ y no
// existe en un clon recién hecho: con glob su ausencia no rompe typecheck, tests ni `npm run dev`
// (la app queda en "no disponible"); `build:win` sí lo exige (scripts/check-sign-model.mjs).
const modelChunks = import.meta.glob<unknown>('../assets/sign-model.json', { import: 'default' });
const bundledModel = (): Promise<unknown> => {
  const chunk = Object.values(modelChunks)[0];
  if (!chunk) return Promise.reject(new Error('sign-model.json no está en la app'));
  return chunk();
};

/** Etiquetas que producen frase (todas salvo neutral). */
export const signLabels = (s: Pick<SignModelState, 'labels'>): string[] =>
  s.labels.filter((l) => l !== NEUTRAL);

/** Modelo LSC global, empaquetado con la app: se carga una vez, sin red ni sesión. */
export const useSignModel = create<SignModelState>()((set) => ({
  status: 'loading',
  classifier: null,
  workerModel: null,
  labels: [],
  valAccuracy: null,
  async load(loader = bundledModel) {
    try {
      const json = await loader();
      // Se valida aquí aunque la GRU corra en el worker: un modelo roto se ve al cargar.
      const model = GruModel.fromJson(json);
      // Las etiquetas son los `code` de las frases; `neutral` no está en el mapa.
      const labelToCode = Object.fromEntries(
        model.labels.filter((l) => l !== NEUTRAL).map((l) => [l, l]),
      );
      const options = { cooldownMs: COOLDOWN_MS };
      const acc = (json as { metrics?: { val_accuracy?: unknown } }).metrics?.val_accuracy;
      // En desarrollo, cada predicción publica todas las probabilidades (panel Diagnóstico).
      const onProbabilities = import.meta.env.DEV
        ? (p: Record<string, number>) => useSignDiagnostics.getState().update(p)
        : undefined;
      set({
        status: 'ready',
        classifier: createSignClassifier(
          new LocalWindowModel(model, onProbabilities),
          labelToCode,
          options,
        ),
        workerModel: { weights: json, policy: createSignPolicy(labelToCode, options) },
        labels: [...model.labels],
        valAccuracy: typeof acc === 'number' ? acc : null,
      });
    } catch {
      set({ status: 'error', classifier: null, workerModel: null, labels: [], valAccuracy: null });
    }
  },
}));
