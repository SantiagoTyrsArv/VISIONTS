import type { ModelPrediction } from '../../../../shared/recognitionProtocol';
import type { RecognizedSign } from './SignRecognizer';

export type { ModelPrediction };

/**
 * Modelo con su propia ventana de 30 frames: el reconocedor escribe cada frame con `push`
 * y `predict` clasifica la ventana actual, sin copiar la secuencia entera.
 */
export interface WindowModel {
  push(frame: readonly number[]): void;
  reset(): void;
  predict(): Promise<ModelPrediction | null> | ModelPrediction | null;
}

export interface SignClassifier {
  /** Añade el frame más reciente (126 valores) a la ventana. */
  push(frame: readonly number[]): void;
  /** Vacía la ventana (al reiniciar la cámara). */
  reset(): void;
  /** Clasifica la ventana actual. */
  classify(): Promise<RecognizedSign | null>;
}

export type ClassifierOptions = {
  threshold?: number;
  cooldownMs?: number;
  clock?: () => number;
};

/** Confianza mínima para decir una frase. */
export const DEFAULT_THRESHOLD = 0.8;

/** Decide si una predicción dice una frase: umbral, etiqueta del catálogo y cooldown. */
export type SignPolicy = (prediction: ModelPrediction | null) => RecognizedSign | null;

export function createSignPolicy(
  labelToCode: Readonly<Record<string, string>> = {},
  options: ClassifierOptions = {},
): SignPolicy {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const cooldownMs = options.cooldownMs ?? 1200;
  const clock = options.clock ?? Date.now;
  const lastEmitted = new Map<string, number>();

  return (prediction) => {
    if (
      !prediction ||
      !Number.isFinite(prediction.confidence) ||
      prediction.confidence < threshold
    ) {
      return null;
    }

    const code = labelToCode[prediction.label];
    if (!code) return null;

    const now = clock();
    const last = lastEmitted.get(code);
    if (last !== undefined && now - last < cooldownMs) return null;

    lastEmitted.set(code, now);
    return { code, confidence: prediction.confidence };
  };
}

/** Modelo en este hilo + política. No hay clasificador hasta tener pesos entrenados. */
export function createSignClassifier(
  model?: WindowModel,
  labelToCode: Readonly<Record<string, string>> = {},
  options: ClassifierOptions = {},
): SignClassifier | null {
  if (!model) return null;
  const policy = createSignPolicy(labelToCode, options);
  return {
    push: (frame) => model.push(frame),
    reset: () => model.reset(),
    classify: async () => policy(await model.predict()),
  };
}
