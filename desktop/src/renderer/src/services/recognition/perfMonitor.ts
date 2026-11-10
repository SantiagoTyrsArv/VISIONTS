import { onINP, type INPMetricWithAttribution } from 'web-vitals/attribution';

import type { RecognitionThread } from './windowModels';

export type LongTask = { start: number; duration: number };
export type LongTaskStats = {
  count: number;
  totalMs: number;
  worstMs: number;
  recent: LongTask[];
  /** Inicio de la última contada: al volver a montar el panel, `buffered` repite las viejas. */
  lastStart: number;
};

export const EMPTY_LONG_TASKS: LongTaskStats = {
  count: 0,
  totalMs: 0,
  worstMs: 0,
  recent: [],
  lastStart: -Infinity,
};
const RECENT_LONG_TASKS = 5;

/** Añade tareas largas (> 50 ms) a las estadísticas, sin mutarlas ni contar dos veces. */
export function addLongTasks(stats: LongTaskStats, tasks: readonly LongTask[]): LongTaskStats {
  const fresh = tasks.filter((t) => t.start > stats.lastStart).sort((a, b) => a.start - b.start);
  if (!fresh.length) return stats;
  return {
    count: stats.count + fresh.length,
    totalMs: stats.totalMs + fresh.reduce((sum, t) => sum + t.duration, 0),
    worstMs: Math.max(stats.worstMs, ...fresh.map((t) => t.duration)),
    recent: [...fresh].reverse().concat(stats.recent).slice(0, RECENT_LONG_TASKS),
    lastStart: fresh[fresh.length - 1].start,
  };
}

/** Observa las long tasks del hilo principal. Devuelve la función para dejar de observar. */
export function observeLongTasks(onTasks: (tasks: LongTask[]) => void): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  const observer = new PerformanceObserver((list) =>
    onTasks(list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration }))),
  );
  try {
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    return () => undefined; // navegador sin longtask
  }
  return () => observer.disconnect();
}

export type InpReading = {
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  target: string | null;
  type: 'pointer' | 'keyboard' | null;
  inputDelay: number;
  processingDuration: number;
  presentationDelay: number;
  /** Dónde corría la GRU durante la sesión medida. */
  thread: RecognitionThread;
  measuredAt: string;
};

export function toInpReading(
  metric: INPMetricWithAttribution,
  thread: RecognitionThread,
  now: Date = new Date(),
): InpReading {
  const a = metric.attribution;
  return {
    value: metric.value,
    rating: metric.rating,
    target: a.interactionTarget || null,
    type: a.interactionType ?? null,
    inputDelay: a.inputDelay,
    processingDuration: a.processingDuration,
    presentationDelay: a.presentationDelay,
    thread,
    measuredAt: now.toISOString(),
  };
}

/**
 * El selector de web-vitals es la ruta entera, con los hashes de CSS Modules: se muestra solo
 * el último elemento sin hash (`button._quickBtn_sgqwh_787` → `button.quickBtn`).
 */
export function shortTarget(target: string | null): string {
  if (!target) return '—';
  const last = target.split('>').pop()!.trim();
  return last.replace(/\._([A-Za-z][\w-]*?)_[a-z0-9]{5}_\d+/g, '.$1');
}

const listeners = new Set<(metric: INPMetricWithAttribution) => void>();
let inpStarted = false;

/**
 * INP de la sesión (con atribución). web-vitals no permite reiniciarlo ni darse de baja, así
 * que se registra una sola vez y se reparte a los suscriptores.
 */
export function subscribeInp(listener: (metric: INPMetricWithAttribution) => void): () => void {
  listeners.add(listener);
  if (!inpStarted && typeof PerformanceObserver !== 'undefined') {
    inpStarted = true;
    onINP((metric) => listeners.forEach((l) => l(metric)), { reportAllChanges: true });
  }
  return () => listeners.delete(listener);
}
