import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modelsApi } from '@/api/endpoints';
import type { ModelStatus } from '@/api/types';
import { MODEL_POLL_MS, MODEL_RETRY_MS, useSignModel } from '@/store/signModel';
import { useSession } from '@/store/session';

vi.mock('@/api/endpoints', () => ({
  modelsApi: { status: vi.fn(), weights: vi.fn(), train: vi.fn() },
}));

/** Pesos válidos mínimos: hidden 1, todo ceros salvo el sesgo de salida. */
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
  };
}

const ready = (id: string): ModelStatus['ready'] => ({
  id,
  labels: ['neutral', 'yes'],
  metrics: { val_accuracy: 0.9, per_label: {}, samples: {} },
  created_at: '2026-10-07T00:00:00Z',
});
const SEQ = Array<number>(3780).fill(0);

beforeEach(() => {
  vi.mocked(modelsApi.status).mockReset();
  vi.mocked(modelsApi.weights).mockReset();
  useSignModel.getState().clear();
});
afterEach(() => vi.useRealTimers());

describe('store del modelo', () => {
  it('sin modelo → status none y sin clasificador', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: null, latest: null });
    await useSignModel.getState().refresh();
    expect(useSignModel.getState()).toMatchObject({ status: 'none', classifier: null });
  });

  it('carga los pesos una sola vez por id de modelo', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    await useSignModel.getState().refresh();
    expect(modelsApi.weights).toHaveBeenCalledTimes(1);
    expect(useSignModel.getState()).toMatchObject({ status: 'ready', modelId: 'm1' });
    const sign = await useSignModel.getState().classifier!.classify(SEQ);
    expect(sign).toEqual({ code: 'yes', confidence: expect.any(Number) });
  });

  it('una predicción de reposo nunca produce frase', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [9, 0]));
    await useSignModel.getState().refresh();
    expect(await useSignModel.getState().classifier!.classify(SEQ)).toBeNull();
  });

  it('pesos inválidos → status error', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue({ format: 'otro' });
    await useSignModel.getState().refresh();
    expect(useSignModel.getState()).toMatchObject({ status: 'error', classifier: null });
  });

  it('si el reentrenamiento falla, sigue usando el modelo anterior', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({
      ready: ready('m1'),
      latest: { id: 'm2', status: 'failed', error: 'Entrenamiento interrumpido', created_at: '' },
    });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    expect(useSignModel.getState().status).toBe('ready');
    expect(useSignModel.getState().job?.error).toBe('Entrenamiento interrumpido');
  });

  it('sondea mientras entrena y se detiene al cerrar sesión', async () => {
    vi.useFakeTimers();
    vi.mocked(modelsApi.status).mockResolvedValue({
      ready: null,
      latest: { id: 'm1', status: 'training', error: null, created_at: '' },
    });
    await useSignModel.getState().refresh();
    expect(modelsApi.status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MODEL_POLL_MS);
    expect(modelsApi.status).toHaveBeenCalledTimes(2);

    useSession.setState({ status: 'authenticated' });
    useSession.setState({ status: 'unauthenticated' });
    await vi.advanceTimersByTimeAsync(MODEL_POLL_MS * 3);
    expect(modelsApi.status).toHaveBeenCalledTimes(2);
    expect(useSignModel.getState()).toMatchObject({ status: 'unknown', job: null });
  });

  it('cerrar sesión descarta el modelo de la memoria', async () => {
    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    useSession.setState({ status: 'authenticated' });
    await useSignModel.getState().refresh();
    useSession.setState({ status: 'unauthenticated' });
    expect(useSignModel.getState()).toMatchObject({ classifier: null, modelId: null });
  });

  it('un fallo de red conserva el estado actual', async () => {
    vi.mocked(modelsApi.status).mockResolvedValueOnce({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    vi.mocked(modelsApi.status).mockRejectedValueOnce(new Error('offline'));
    await useSignModel.getState().refresh();
    expect(useSignModel.getState().status).toBe('ready');
  });

  it('si la primera consulta falla, reintenta hasta cargar el modelo', async () => {
    vi.useFakeTimers();
    vi.mocked(modelsApi.status)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    expect(useSignModel.getState().status).toBe('unknown');
    await vi.advanceTimersByTimeAsync(MODEL_RETRY_MS);
    expect(useSignModel.getState()).toMatchObject({ status: 'ready', modelId: 'm1' });
  });

  it('un fallo de red al bajar los pesos conserva el modelo anterior y reintenta', async () => {
    vi.useFakeTimers();
    vi.mocked(modelsApi.status).mockResolvedValueOnce({ ready: ready('m1'), latest: null });
    vi.mocked(modelsApi.weights).mockResolvedValueOnce(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    const previous = useSignModel.getState().classifier;

    vi.mocked(modelsApi.status).mockResolvedValue({ ready: ready('m2'), latest: null });
    vi.mocked(modelsApi.weights)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(weights(['neutral', 'yes'], [0, 5]));
    await useSignModel.getState().refresh();
    expect(useSignModel.getState()).toMatchObject({ status: 'ready', modelId: 'm1' });
    expect(useSignModel.getState().classifier).toBe(previous);

    await vi.advanceTimersByTimeAsync(MODEL_RETRY_MS);
    expect(useSignModel.getState().modelId).toBe('m2');
  });

  it('dos consultas a la vez no dejan sondeos vivos tras cerrar sesión', async () => {
    vi.useFakeTimers();
    vi.mocked(modelsApi.status).mockResolvedValue({
      ready: null,
      latest: { id: 'm1', status: 'training', error: null, created_at: '' },
    });
    useSession.setState({ status: 'authenticated' });
    await Promise.all([useSignModel.getState().refresh(), useSignModel.getState().refresh()]);
    expect(modelsApi.status).toHaveBeenCalledTimes(2);
    useSession.setState({ status: 'unauthenticated' });
    await vi.advanceTimersByTimeAsync(MODEL_POLL_MS * 3);
    expect(modelsApi.status).toHaveBeenCalledTimes(2);
  });
});
