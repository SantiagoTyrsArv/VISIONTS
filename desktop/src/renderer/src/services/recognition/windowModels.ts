import type { ModelPrediction } from '../../../../shared/recognitionProtocol';
import { probabilityMap, type ClassProbabilities } from './diagnostics';
import { bestOf, type GruModel } from './GruModel';
import { SEQUENCE_LENGTH, VALUES_PER_FRAME } from './landmarks';
import type { WindowModel } from './SignClassifier';

/** Últimos 30 frames en un anillo: escribir un frame no mueve ni copia los demás. */
export class FrameRing {
  readonly frames = new Float32Array(SEQUENCE_LENGTH * VALUES_PER_FRAME);
  private written = 0;

  push(frame: readonly number[]): void {
    this.frames.set(frame, (this.written % SEQUENCE_LENGTH) * VALUES_PER_FRAME);
    this.written += 1;
  }

  reset(): void {
    this.written = 0;
  }

  /** Hueco donde empieza la ventana (el frame más antiguo), o null si aún no hay 30. */
  windowStart(): number | null {
    return this.written < SEQUENCE_LENGTH ? null : this.written % SEQUENCE_LENGTH;
  }
}

type ProbabilitiesListener = (probabilities: ClassProbabilities) => void;

/**
 * La GRU sobre la ventana, en el hilo que la llame: el principal (modo «antes») o el worker,
 * donde corre junto a MediaPipe.
 */
export class LocalWindowModel implements WindowModel {
  private readonly ring = new FrameRing();

  constructor(
    private readonly model: GruModel,
    private readonly onProbabilities?: ProbabilitiesListener,
  ) {}

  push(frame: readonly number[]): void {
    this.ring.push(frame);
  }

  reset(): void {
    this.ring.reset();
  }

  predict(): ModelPrediction | null {
    const start = this.ring.windowStart();
    if (start === null) return null;
    const probs = this.model.probabilitiesFrom(this.ring.frames, start, SEQUENCE_LENGTH);
    this.onProbabilities?.(probabilityMap(this.model.labels, probs));
    return bestOf(this.model.labels, probs);
  }
}

export type RecognitionThread = 'worker' | 'main';
