import { describe, expect, it, vi } from 'vitest';

import { withDiagnostics } from './diagnostics';

const model = {
  labels: ['good_morning', 'neutral'] as const,
  probabilities: vi.fn(() => [0.3, 0.7]),
};

describe('withDiagnostics', () => {
  it('publica la probabilidad de cada clase y devuelve la más alta', () => {
    const onProbabilities = vi.fn();
    const wrapped = withDiagnostics(model, onProbabilities);

    const prediction = wrapped.predict(new Array(30 * 126).fill(0));

    expect(onProbabilities).toHaveBeenCalledWith({ good_morning: 0.3, neutral: 0.7 });
    expect(prediction).toEqual({ label: 'neutral', confidence: 0.7 });
    expect(model.probabilities).toHaveBeenCalledTimes(1);
  });

  it('no publica nada si la secuencia no tiene el tamaño esperado', () => {
    const onProbabilities = vi.fn();
    const wrapped = withDiagnostics(model, onProbabilities);

    expect(wrapped.predict([1, 2, 3])).toBeNull();
    expect(onProbabilities).not.toHaveBeenCalled();
  });
});
