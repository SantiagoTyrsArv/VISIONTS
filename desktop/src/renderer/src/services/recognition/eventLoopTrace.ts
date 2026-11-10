/**
 * Traza de un ciclo de reconocimiento, para el panel Diagnóstico. Hace explícita la cadena.
 *
 * Con el worker (WorkerSignRecognizer):
 *   requestVideoFrameCallback (task) → createImageBitmap resuelto y postMessage con el bitmap
 *   transferido (microtask) → MediaPipe y GRU en el worker (otro hilo)
 *   → `message` del worker (task): se aplica la política y se dice la frase
 *
 * Todo en el hilo principal (MediaPipeSignRecognizer, el modo «antes»):
 *   requestVideoFrameCallback (task) con MediaPipe y la GRU dentro
 *   → `.then()` de classify (microtask, al terminar esa task)
 */
export type TraceStepId =
  | 'frame'
  | 'detectMain'
  | 'inferMain'
  | 'then'
  | 'capture'
  | 'workerDetect'
  | 'workerInfer'
  | 'message';

/** task / microtask: colas del event loop del hilo principal; worker: otro hilo. */
export type TraceKind = 'task' | 'sync' | 'microtask' | 'worker';

export type TraceStep = {
  id: TraceStepId;
  kind: TraceKind;
  /** ms desde el inicio del callback de requestVideoFrameCallback. */
  start: number;
  duration: number;
};

export type CycleTrace = { steps: TraceStep[]; total: number };

/** El panel se repinta como mucho a esta frecuencia: medir no debe empeorar el INP. */
const PUBLISH_INTERVAL_MS = 250;

/** Convierte un tiempo absoluto del worker (ms desde epoch) a `performance.now()` local. */
export const fromEpoch = (epochMs: number): number => epochMs - performance.timeOrigin;

class LoopTracer {
  private publish: ((trace: CycleTrace) => void) | null = null;
  private origin: number | null = null;
  private steps: TraceStep[] = [];
  private lastPublished = -Infinity;

  /** Activa la traza mientras el panel está montado. */
  connect(publish: (trace: CycleTrace) => void): () => void {
    this.publish = publish;
    return () => {
      if (this.publish === publish) this.publish = null;
      this.origin = null;
    };
  }

  /** Empieza un ciclo; `frameStart` es cuando arrancó el callback del frame. */
  begin(frameStart: number): void {
    if (!this.publish) return;
    this.origin = frameStart;
    this.steps = [];
  }

  /** Registra un paso del ciclo en curso (tiempos de `performance.now()`). */
  mark(id: TraceStepId, kind: TraceKind, start: number, end: number = start): void {
    if (this.origin === null) return;
    this.steps.push({ id, kind, start: start - this.origin, duration: Math.max(0, end - start) });
  }

  /** Cierra el ciclo y lo publica (limitado a PUBLISH_INTERVAL_MS). */
  end(now: number = performance.now()): void {
    if (this.origin === null) return;
    const origin = this.origin;
    this.origin = null;
    this.publishSteps(origin, this.steps, now);
  }

  /**
   * Publica un ciclo ya completo (modo worker: sus tiempos llegan juntos en el mensaje).
   * `steps` con tiempos absolutos de `performance.now()`.
   */
  record(
    origin: number,
    steps: readonly { id: TraceStepId; kind: TraceKind; start: number; end: number }[],
    now: number = performance.now(),
  ): void {
    if (!this.publish) return;
    this.publishSteps(
      origin,
      steps.map(({ id, kind, start, end }) => ({
        id,
        kind,
        start: start - origin,
        duration: Math.max(0, end - start),
      })),
      now,
    );
  }

  private publishSteps(origin: number, steps: readonly TraceStep[], now: number): void {
    const publish = this.publish;
    if (!publish || now - this.lastPublished < PUBLISH_INTERVAL_MS) return;
    this.lastPublished = now;
    publish({ steps: [...steps].sort((a, b) => a.start - b.start), total: now - origin });
  }

  get active(): boolean {
    return this.origin !== null;
  }
}

export const loopTrace = new LoopTracer();
