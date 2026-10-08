import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { HashRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { modelsApi, samplesApi } from '@/api/endpoints';
import Train from '@/routes/Train';
import type { LandmarkFrame } from '@/services/recognition/SignRecognizer';
import { useSignModel } from '@/store/signModel';

const captured = vi.hoisted(() => ({ onFrame: null as null | ((f: LandmarkFrame) => void) }));
vi.mock('@/hooks/useSignRecognition', () => ({
  useSignRecognition: (
    _ref: unknown,
    _onSign: unknown,
    options: { onFrame?: (f: LandmarkFrame) => void },
  ) => {
    captured.onFrame = options.onFrame ?? null;
    return {
      cam: { kind: 'ready' },
      cameras: [],
      recognition: { phase: 'ready', handsDetected: true, modelAvailable: false },
      cameraId: null,
      retry: vi.fn(),
      selectCamera: vi.fn(),
    };
  },
  visionMessageKey: () => 'camera.handsDetected',
}));
vi.mock('@/api/endpoints', () => ({
  SAMPLES_KEY: ['samples-summary'],
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'yes', text_es: 'Sí', is_default: true },
      { id: '2', code: 'no', text_es: 'No', is_default: true },
    ],
  },
  samplesApi: { create: vi.fn(), summary: vi.fn(), remove: vi.fn() },
  modelsApi: { train: vi.fn(), status: vi.fn(), weights: vi.fn() },
}));

const http = (status: number) =>
  new AxiosError('x', String(status), undefined, undefined, { status } as AxiosResponse);

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HashRouter>
        <Train timing={{ countdownSeconds: 0, pauseMs: 0 }} />
      </HashRouter>
    </QueryClientProvider>,
  );
}

async function sendFrames(n: number, handsDetected = true) {
  await act(async () => {
    for (let i = 0; i < n; i += 1) {
      captured.onFrame?.({ values: Array<number>(126).fill(0.1), handsDetected });
    }
  });
}

const row = (name: string) => screen.getByRole('listitem', { name });

beforeEach(() => {
  vi.mocked(samplesApi.create).mockReset().mockResolvedValue({ id: 's' });
  vi.mocked(samplesApi.summary)
    .mockReset()
    .mockResolvedValue({ counts: { yes: 3 } });
  vi.mocked(samplesApi.remove).mockReset().mockResolvedValue(undefined);
  vi.mocked(modelsApi.train).mockReset().mockResolvedValue({ id: 'm', status: 'queued' });
  vi.mocked(modelsApi.status).mockReset().mockResolvedValue({ ready: null, latest: null });
  useSignModel.getState().clear();
});

describe('pantalla Entrenar', () => {
  it('lista Reposo y las frases con su contador', async () => {
    renderScreen();
    expect(await screen.findByText('3 / 20 muestras')).toBeInTheDocument();
    expect(row('Reposo (manos quietas o bajadas)')).toHaveTextContent('0 / 20 muestras');
    expect(row('Sí')).toHaveTextContent('3 / 20 muestras');
  });

  it('graba una ráfaga y la sube al momento', async () => {
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Grabar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Grabando 1 de 5');
    await sendFrames(30);
    expect(samplesApi.create).toHaveBeenCalledWith('yes', expect.any(Array));
    expect(vi.mocked(samplesApi.create).mock.calls[0][1]).toHaveLength(3780);
  });

  it('una ráfaga sin manos no se sube', async () => {
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Grabar' }));
    await sendFrames(30, false);
    expect(samplesApi.create).not.toHaveBeenCalled();
    expect(screen.getByText('No se vieron tus manos; repite la seña.')).toBeInTheDocument();
  });

  it('si falla la subida se detiene la sesión y se avisa', async () => {
    vi.mocked(samplesApi.create).mockRejectedValue(new AxiosError('Network Error'));
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Grabar' }));
    await sendFrames(30);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar la muestra');
    expect(screen.queryByRole('button', { name: 'Parar' })).not.toBeInTheDocument();
    await sendFrames(30);
    expect(samplesApi.create).toHaveBeenCalledTimes(1);
  });

  it('"Entrenar modelo" se activa con Reposo y 2 frases al mínimo', async () => {
    vi.mocked(samplesApi.summary).mockResolvedValue({ counts: { neutral: 20, yes: 20, no: 19 } });
    const { unmount } = renderScreen();
    expect(await screen.findByRole('button', { name: 'Entrenar modelo' })).toBeDisabled();
    unmount();

    vi.mocked(samplesApi.summary).mockResolvedValue({ counts: { neutral: 20, yes: 20, no: 20 } });
    renderScreen();
    const button = await screen.findByRole('button', { name: 'Entrenar modelo' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(modelsApi.train).toHaveBeenCalled();
    expect(modelsApi.status).toHaveBeenCalled();
  });

  it('muestra el error 409 del servidor', async () => {
    vi.mocked(samplesApi.summary).mockResolvedValue({ counts: { neutral: 20, yes: 20, no: 20 } });
    vi.mocked(modelsApi.train).mockRejectedValue(http(409));
    renderScreen();
    const button = await screen.findByRole('button', { name: 'Entrenar modelo' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya hay un entrenamiento en curso.');
  });

  it('muestra la precisión por frase y avisa si es baja', async () => {
    useSignModel.setState({
      status: 'ready',
      metrics: { val_accuracy: 0.85, per_label: { yes: 0.95, no: 0.6 }, samples: {} },
    });
    renderScreen();
    expect(await screen.findByText('Precisión del modelo: 85 %')).toBeInTheDocument();
    // Las frases llegan después que las métricas (que salen del store).
    expect(await screen.findByRole('listitem', { name: 'Sí' })).toHaveTextContent(
      'Precisión: 95 %',
    );
    expect(row('No')).toHaveTextContent('Precisión: 60 % · graba más muestras');
  });

  it('borrar muestras de una frase pide confirmación', async () => {
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Borrar muestras' }));
    expect(samplesApi.remove).not.toHaveBeenCalled();
    await userEvent.click(
      within(row('Sí')).getByRole('button', { name: '¿Borrar? Pulsa otra vez' }),
    );
    expect(samplesApi.remove).toHaveBeenCalledWith('yes');
  });

  it('muestra el error de un entrenamiento fallido', async () => {
    useSignModel.setState({
      job: { id: 'm', status: 'failed', error: 'Entrenamiento interrumpido', created_at: '' },
    });
    renderScreen();
    expect(
      await screen.findByText('El entrenamiento falló: Entrenamiento interrumpido'),
    ).toBeInTheDocument();
  });

  it('un fallo de subida tardío no detiene una sesión nueva de otra frase', async () => {
    let rejectUpload: (e: unknown) => void = () => {};
    vi.mocked(samplesApi.create).mockImplementationOnce(
      () => new Promise((_, reject) => (rejectUpload = reject)),
    );
    renderScreen();
    await screen.findByText('3 / 20 muestras');
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Grabar' }));
    await sendFrames(30);
    await userEvent.click(within(row('Sí')).getByRole('button', { name: 'Parar' }));
    await userEvent.click(within(row('No')).getByRole('button', { name: 'Grabar' }));

    await act(async () => rejectUpload(new AxiosError('Network Error')));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo enviar la muestra');
    expect(within(row('No')).getByRole('button', { name: 'Parar' })).toBeInTheDocument();
    await sendFrames(30);
    expect(samplesApi.create).toHaveBeenLastCalledWith('no', expect.any(Array));
  });
});
