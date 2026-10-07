import { describe, expect, it, vi } from 'vitest';

import { createSignClassifier } from './SignClassifier';

const sequence = Array(30 * 126).fill(0);

describe('createSignClassifier', () => {
  it('no crea un clasificador si no hay modelo entrenado', () => {
    expect(createSignClassifier()).toBeNull();
  });

  it('mapea etiquetas conocidas y rechaza etiquetas ajenas al catálogo', async () => {
    const clock = vi.fn(() => 1000);
    const classifier = createSignClassifier(
      { predict: vi.fn().mockResolvedValue({ label: 'SALUDO', confidence: 0.95 }) },
      { SALUDO: 'hello' },
      { clock, cooldownMs: 0 },
    )!;

    await expect(classifier.classify(sequence)).resolves.toEqual({
      code: 'hello',
      confidence: 0.95,
    });

    const unknown = createSignClassifier(
      { predict: vi.fn().mockResolvedValue({ label: 'UNKNOWN', confidence: 0.99 }) },
      { SALUDO: 'hello' },
      { cooldownMs: 0 },
    )!;
    await expect(unknown.classify(sequence)).resolves.toBeNull();
  });

  it('aplica umbral, tamaño fijo de entrada y cooldown por seña', async () => {
    let now = 0;
    const model = { predict: vi.fn().mockResolvedValue({ label: 'SALUDO', confidence: 0.79 }) };
    const classifier = createSignClassifier(
      model,
      { SALUDO: 'hello' },
      {
        threshold: 0.8,
        cooldownMs: 1200,
        clock: () => now,
      },
    )!;

    await expect(classifier.classify(sequence.slice(1))).resolves.toBeNull();
    await expect(classifier.classify(sequence)).resolves.toBeNull();

    model.predict.mockResolvedValue({ label: 'SALUDO', confidence: 0.9 });
    await expect(classifier.classify(sequence)).resolves.toEqual({
      code: 'hello',
      confidence: 0.9,
    });
    now = 500;
    await expect(classifier.classify(sequence)).resolves.toBeNull();
    now = 1200;
    await expect(classifier.classify(sequence)).resolves.toEqual({
      code: 'hello',
      confidence: 0.9,
    });
  });
});
