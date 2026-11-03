import { SEQUENCE_LENGTH, VALUES_PER_FRAME } from './landmarks';
import type { LandmarkModel, ModelPrediction } from './SignClassifier';

export type ClassProbabilities = Record<string, number>;

type ProbabilisticModel = {
  readonly labels: readonly string[];
  probabilities(sequence: readonly number[]): number[];
};

/**
 * Envuelve el modelo para publicar la probabilidad de cada clase en cada predicción.
 * Solo para diagnóstico en desarrollo: el resultado es el mismo que el de `predict`.
 */
export function withDiagnostics(
  model: ProbabilisticModel,
  onProbabilities: (probabilities: ClassProbabilities) => void,
): LandmarkModel & { predict(sequence: readonly number[]): ModelPrediction | null } {
  return {
    predict(sequence) {
      if (sequence.length !== SEQUENCE_LENGTH * VALUES_PER_FRAME) return null;
      const probs = model.probabilities(sequence);
      let best = 0;
      for (let i = 1; i < probs.length; i += 1) if (probs[i] > probs[best]) best = i;
      onProbabilities(Object.fromEntries(model.labels.map((l, i) => [l, probs[i]])));
      return { label: model.labels[best], confidence: probs[best] };
    },
  };
}
