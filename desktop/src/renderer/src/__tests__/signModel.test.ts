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
const SEQ = Array<number>(3780).fill(0);

beforeEach(() =>
  useSignModel.setState({ status: 'loading', classifier: null, labels: [], valAccuracy: null }),
);

describe('useSignModel (modelo empaquetado)', () => {
  it('carga el modelo y clasifica sin red', async () => {
    await useSignModel.getState().load(async () => weights(['hello', 'neutral'], [5, 0]));
    const s = useSignModel.getState();
    expect(s.status).toBe('ready');
    expect(s.valAccuracy).toBe(0.91);
    expect(signLabels(s)).toEqual(['hello']);
    expect(await s.classifier!.classify(SEQ)).toMatchObject({ code: 'hello' });
  });

  it('neutral nunca produce frase', async () => {
    await useSignModel.getState().load(async () => weights(['hello', 'neutral'], [0, 5]));
    expect(await useSignModel.getState().classifier!.classify(SEQ)).toBeNull();
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
});
