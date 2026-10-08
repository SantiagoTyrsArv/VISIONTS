import { create } from 'zustand';

import { modelsApi } from '@/api/endpoints';
import type { ModelJob, ModelMetrics } from '@/api/types';
import { GruModel } from '@/services/recognition/GruModel';
import { createSignClassifier, type SignClassifier } from '@/services/recognition/SignClassifier';
import { useSession } from '@/store/session';

export const MODEL_POLL_MS = 3000;
const NEUTRAL = 'neutral';

type ModelStatus = 'unknown' | 'none' | 'ready' | 'error';

type SignModelState = {
  status: ModelStatus;
  classifier: SignClassifier | null;
  modelId: string | null;
  labels: string[];
  metrics: ModelMetrics | null;
  /** Último entrenamiento posterior al modelo listo (en cola, entrenando o fallido). */
  job: ModelJob | null;
  refresh: () => Promise<void>;
  clear: () => void;
};

export const isTraining = (job: ModelJob | null): boolean =>
  job?.status === 'queued' || job?.status === 'training';

const initial = {
  status: 'unknown' as ModelStatus,
  classifier: null,
  modelId: null,
  labels: [],
  metrics: null,
  job: null,
};

// Generación: una respuesta que llega tras clear() (cierre de sesión) se descarta.
let generation = 0;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

/** Modelo de señas del usuario, solo en memoria: nunca se escribe en disco. */
export const useSignModel = create<SignModelState>()((set, get) => ({
  ...initial,

  async refresh() {
    const gen = generation;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    let job: ModelJob | null = get().job;
    try {
      const { ready, latest } = await modelsApi.status();
      if (gen !== generation) return;
      job = latest;
      set({ job });
      if (!ready) {
        set({ status: 'none', classifier: null, modelId: null, labels: [], metrics: null });
      } else if (ready.id !== get().modelId) {
        try {
          const model = GruModel.fromJson(await modelsApi.weights());
          if (gen !== generation) return;
          // `neutral` no está en el mapa: nunca se convierte en frase.
          const labelToCode = Object.fromEntries(
            model.labels.filter((l) => l !== NEUTRAL).map((l) => [l, l]),
          );
          set({
            status: 'ready',
            classifier: createSignClassifier(model, labelToCode),
            modelId: ready.id,
            labels: [...model.labels],
            metrics: ready.metrics,
          });
        } catch {
          if (gen !== generation) return;
          set({ status: 'error', classifier: null, modelId: null, labels: [], metrics: null });
        }
      }
    } catch {
      // Sin red: se conserva el estado actual y se reintenta en el siguiente sondeo.
    }
    if (gen === generation && isTraining(job)) {
      pollTimer = setTimeout(() => void get().refresh(), MODEL_POLL_MS);
    }
  },

  clear() {
    generation += 1;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    set(initial);
  },
}));

// Al cerrar sesión (o si caduca), el modelo se descarta de la memoria.
useSession.subscribe((state, prev) => {
  if (prev.status === 'authenticated' && state.status !== 'authenticated') {
    useSignModel.getState().clear();
  }
});
