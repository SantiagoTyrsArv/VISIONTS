import { create } from 'zustand';

import type { ClassProbabilities } from '@/services/recognition/diagnostics';
import type { CycleTrace } from '@/services/recognition/eventLoopTrace';
import {
  EMPTY_LONG_TASKS,
  addLongTasks,
  type InpReading,
  type LongTask,
  type LongTaskStats,
} from '@/services/recognition/perfMonitor';
import {
  loadInpByThread,
  saveInpByThread,
  type InpByThread,
} from '@/services/recognition/recognitionThread';

/** Dónde corre el reconocimiento y cómo sabe el hilo principal que el worker está libre. */
export type RecognitionExecution = 'main' | 'worker-shared' | 'worker-message';

type SignDiagnosticsState = {
  execution: RecognitionExecution | null;
  /** Última lectura del modelo; null si no se ha ejecutado (sin manos en la ventana). */
  probabilities: ClassProbabilities | null;
  /** Último ciclo frame → inferencia → resultado, paso a paso. */
  trace: CycleTrace | null;
  longTasks: LongTaskStats;
  /** INP de esta sesión y la última lectura de cada modo (de esta u otras sesiones). */
  inp: InpReading | null;
  inpByThread: InpByThread;
  setExecution: (execution: RecognitionExecution | null) => void;
  update: (probabilities: ClassProbabilities) => void;
  clear: () => void;
  setTrace: (trace: CycleTrace) => void;
  addLongTasks: (tasks: LongTask[]) => void;
  setInp: (reading: InpReading) => void;
};

/** Lo que ve el modelo y cuánto le cuesta al hilo principal. Solo se llena en desarrollo. */
export const useSignDiagnostics = create<SignDiagnosticsState>()((set) => ({
  execution: null,
  probabilities: null,
  trace: null,
  longTasks: EMPTY_LONG_TASKS,
  inp: null,
  inpByThread: loadInpByThread(),
  setExecution: (execution) => set({ execution }),
  update: (probabilities) => set({ probabilities }),
  clear: () => set({ probabilities: null }),
  setTrace: (trace) => set({ trace }),
  addLongTasks: (tasks) => set((s) => ({ longTasks: addLongTasks(s.longTasks, tasks) })),
  setInp: (reading) =>
    set((s) => {
      const inpByThread = { ...s.inpByThread, [reading.thread]: reading };
      saveInpByThread(inpByThread);
      return { inp: reading, inpByThread };
    }),
}));
