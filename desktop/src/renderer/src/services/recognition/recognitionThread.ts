import type { InpReading } from './perfMonitor';
import type { RecognitionThread } from './windowModels';

/**
 * Dónde corre la GRU. En producción siempre en el worker; en desarrollo el panel Diagnóstico
 * permite volver al hilo principal para medir el INP «antes» y compararlo con el «después».
 * INP no se puede reiniciar dentro de una sesión: cambiar de modo recarga la app, y la última
 * lectura de cada modo se guarda para verlas juntas.
 */
const THREAD_KEY = 'senavoz.diagnostics.recognitionThread';
const INP_KEY = 'senavoz.diagnostics.inp';

export function getRecognitionThread(): RecognitionThread {
  if (!import.meta.env.DEV) return 'worker';
  try {
    return localStorage.getItem(THREAD_KEY) === 'main' ? 'main' : 'worker';
  } catch {
    return 'worker';
  }
}

export function setRecognitionThread(thread: RecognitionThread): void {
  try {
    localStorage.setItem(THREAD_KEY, thread);
  } catch {
    // Sin almacenamiento el cambio no sobrevive a la recarga: se queda en el worker.
  }
}

export type InpByThread = Partial<Record<RecognitionThread, InpReading>>;

export function loadInpByThread(): InpByThread {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(INP_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: InpByThread = {};
    for (const thread of ['main', 'worker'] as const) {
      const r = (parsed as Record<string, unknown>)[thread] as InpReading | undefined;
      if (r && typeof r.value === 'number' && r.thread === thread) out[thread] = r;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveInpByThread(readings: InpByThread): void {
  try {
    localStorage.setItem(INP_KEY, JSON.stringify(readings));
  } catch {
    // Solo se pierde la comparación entre sesiones.
  }
}
