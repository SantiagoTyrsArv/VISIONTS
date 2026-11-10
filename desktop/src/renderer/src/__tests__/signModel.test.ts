import { beforeEach, describe, expect, it } from 'vitest';

import { signLabels, useSignModel } from '@/store/signModel';

function weights(labels: string[], bias: number[]) {
  const row = (n: number) => Array<number>(n).fill(0);
  return {
    format: 'senavoz-gru-v1',
    input_size: 126,
    hidden_size: 1,
    labels,
    gru: {
      weight_ih: [row(126), row(126), row(126)],
      weight_hh: [[0], [0], [0]],
      bias_ih: row(3),
      bias_hh: row(3),
    },
    head: { weight: labels.map(() => [0]), bias },
    metrics: { val_accuracy: 0.91, per_label: {} },
  };
}
const FRAME = Array<number>(126).fill(0);
/** Llena la ventana de 30 frames y clasifica. */
async function classifyWindow() {
  const classifier = useSignModel.getState().classifier!;
  for (let i = 0; i < 30; i += 1) classifier.push(FRAME);
  return classifier.classify();
}

beforeEach(() =>
  useSignModel.setState({
    status: 'loading',
    classifier: null,
    workerModel: null,
    labels: [],
    valAccuracy: null,
  }),
);

describe('useSignModel (modelo empaquetado)', () => {
  it('carga el modelo y clasifica sin red', async () => {
    await useSignModel.getState().load(async () => weights(['hello', 'neutral'], [5, 0]));
    const s = useSignModel.getState();
    expect(s.status).toBe('ready');
    expect(s.valAccuracy).toBe(0.91);
    expect(signLabels(s)).toEqual(['hello']);
    expect(await classifyWindow()).toMatchObject({ code: 'hello' });
  });

  it('neutral nunca produce frase', async () => {
    await useSignModel.getState().load(async () => weights(['hello', 'neutral'], [0, 5]));
    expect(await classifyWindow()).toBeNull();
  });

  it('un JSON inválido deja el estado en error sin clasificador', async () => {
    await useSignModel.getState().load(async () => ({ format: 'otro' }));
    expect(useSignModel.getState()).toMatchObject({ status: 'error', classifier: null });
  });

  it('un fallo al importar también deja el estado en error', async () => {
    await useSignModel.getState().load(async () => {
      throw new Error('chunk');
    });
    expect(useSignModel.getState().status).toBe('error');
  });

  it('carga el modelo empaquetado (generado por training/)', async () => {
    await useSignModel.getState().load();
    const s = useSignModel.getState();
    expect(s.status).toBe('ready');
    expect(s.labels).toContain('neutral');
    expect(signLabels(s).length).toBeGreaterThanOrEqual(2);
  });

  it('prepara los pesos y la política para el worker', async () => {
    const json = weights(['hello', 'neutral'], [5, 0]);
    await useSignModel.getState().load(async () => json);
    const { workerModel } = useSignModel.getState();
    expect(workerModel?.weights).toBe(json);
    const policy = workerModel!.policy;
    expect(policy({ label: 'hello', confidence: 0.95 })).toMatchObject({ code: 'hello' });
    // Cooldown: la misma seña sigue en la ventana y no se repite enseguida.
    expect(policy({ label: 'hello', confidence: 0.95 })).toBeNull();
    expect(policy({ label: 'neutral', confidence: 0.99 })).toBeNull();
  });

  it('un JSON inválido no deja pesos para el worker', async () => {
    await useSignModel.getState().load(async () => ({ format: 'otro' }));
    expect(useSignModel.getState().workerModel).toBeNull();
  });
});
