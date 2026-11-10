import { describe, expect, it, vi } from 'vitest';

import { createSignClassifier, type WindowModel } from './SignClassifier';

const windowModel = (prediction: { label: string; confidence: number } | null) => ({
  push: vi.fn<WindowModel['push']>(),
  reset: vi.fn<WindowModel['reset']>(),
  predict: vi.fn<() => Promise<{ label: string; confidence: number } | null>>(
    async () => prediction,
  ),
});

describe('createSignClassifier', () => {
  it('no crea un clasificador si no hay modelo entrenado', () => {
    expect(createSignClassifier()).toBeNull();
  });

  it('pasa los frames y el reinicio a la ventana del modelo', () => {
    const model = windowModel(null);
    const classifier = createSignClassifier(model)!;
    const frame = Array<number>(126).fill(1);
    classifier.push(frame);
    classifier.reset();
    expect(model.push).toHaveBeenCalledWith(frame);
    expect(model.reset).toHaveBeenCalledTimes(1);
  });

  it('mapea etiquetas conocidas y rechaza etiquetas ajenas al catálogo', async () => {
    const clock = vi.fn(() => 1000);
    const classifier = createSignClassifier(
      windowModel({ label: 'SALUDO', confidence: 0.95 }),
      { SALUDO: 'hello' },
      { clock, cooldownMs: 0 },
    )!;

    await expect(classifier.classify()).resolves.toEqual({ code: 'hello', confidence: 0.95 });

    const unknown = createSignClassifier(
      windowModel({ label: 'UNKNOWN', confidence: 0.99 }),
      { SALUDO: 'hello' },
      { cooldownMs: 0 },
    )!;
    await expect(unknown.classify()).resolves.toBeNull();
  });

  it('aplica umbral, ventana incompleta y cooldown por seña', async () => {
    let now = 0;
    const model = windowModel({ label: 'SALUDO', confidence: 0.79 });
    const classifier = createSignClassifier(
      model,
      { SALUDO: 'hello' },
      { threshold: 0.8, cooldownMs: 1200, clock: () => now },
    )!;

    await expect(classifier.classify()).resolves.toBeNull();
    // Ventana sin 30 frames: el modelo no predice.
    model.predict.mockResolvedValueOnce(null);
    await expect(classifier.classify()).resolves.toBeNull();

    model.predict.mockResolvedValue({ label: 'SALUDO', confidence: 0.9 });
    await expect(classifier.classify()).resolves.toEqual({ code: 'hello', confidence: 0.9 });
    now = 500;
    await expect(classifier.classify()).resolves.toBeNull();
    now = 1200;
    await expect(classifier.classify()).resolves.toEqual({ code: 'hello', confidence: 0.9 });
  });
});
