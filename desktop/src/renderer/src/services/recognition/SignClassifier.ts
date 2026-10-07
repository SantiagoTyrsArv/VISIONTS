import type { RecognizedSign } from './SignRecognizer';

export type ModelPrediction = { label: string; confidence: number };

export interface LandmarkModel {
  predict(sequence: readonly number[]): Promise<ModelPrediction | null> | ModelPrediction | null;
}

export interface SignClassifier {
  classify(sequence: readonly number[]): Promise<RecognizedSign | null>;
}

export type ClassifierOptions = {
  threshold?: number;
  cooldownMs?: number;
  clock?: () => number;
};

const EXPECTED_SEQUENCE_VALUES = 30 * 126;

/** Creates a label-to-catalog adapter; no classifier exists until trained weights are supplied. */
export function createSignClassifier(
  model?: LandmarkModel,
  labelToCode: Readonly<Record<string, string>> = {},
  options: ClassifierOptions = {},
): SignClassifier | null {
  if (!model) return null;

  const threshold = options.threshold ?? 0.8;
  const cooldownMs = options.cooldownMs ?? 1200;
  const clock = options.clock ?? Date.now;
  const lastEmitted = new Map<string, number>();

  return {
    async classify(sequence) {
      if (sequence.length !== EXPECTED_SEQUENCE_VALUES) return null;

      const prediction = await model.predict(sequence);
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
    },
  };
}
