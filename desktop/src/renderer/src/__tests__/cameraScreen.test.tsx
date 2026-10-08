import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HashRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Camera from '@/routes/Camera';

const speak = vi.fn();
const recognizerMock = vi.hoisted(() => ({
  emitSign: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  onSign: vi.fn(),
  onStatus: vi.fn(),
}));
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
}));
vi.mock('@/services/recognition/MediaPipeSignRecognizer', () => ({
  MediaPipeSignRecognizer: class {
    start(): void {
      return recognizerMock.start();
    }
    stop(): void {
      recognizerMock.stop();
    }
    onSign(callback: (sign: { code: string; confidence: number }) => void): () => void {
      recognizerMock.emitSign.mockImplementation(callback);
      return vi.fn();
    }
    onStatus(callback: (status: unknown) => void): () => void {
      callback({ phase: 'ready', handsDetected: false, modelAvailable: false });
      return vi.fn();
    }
  },
}));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: { list: async () => [{ id: '1', code: 'hello', text_es: 'Hola', is_default: true }] },
}));
const openCamera = vi.fn();
vi.mock('@/services/camera/camera', async (orig) => ({
  ...(await orig<typeof import('@/services/camera/camera')>()),
  openCamera: (...a: unknown[]) => openCamera(...a),
  listCameras: async () => [],
}));

const stop = vi.fn();
const fakeStream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

function renderScreen(): RenderResult {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HashRouter>
        <Camera />
      </HashRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  speak.mockReset();
  stop.mockReset();
  openCamera.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  recognizerMock.emitSign.mockReset();
  recognizerMock.start.mockReset();
  recognizerMock.stop.mockReset();
});

describe('pantalla de cámara', () => {
  it('muestra que falta el modelo y reproduce una predicción válida del reconocedor', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(
      await screen.findByText(/Detector activo\. Falta un modelo entrenado/),
    ).toBeInTheDocument();

    await act(async () => {
      recognizerMock.emitSign({ code: 'hello', confidence: 0.91 });
    });

    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
    expect(screen.getByText('Seña detectada: Hola')).toBeInTheDocument();
  });

  it('ignora códigos de seña que no pertenecen al catálogo', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await screen.findByText(/Detector activo/);

    await act(async () => {
      recognizerMock.emitSign({ code: 'not-in-catalog', confidence: 0.99 });
    });

    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByText(/Seña detectada/)).not.toBeInTheDocument();
  });

  it('cámara en uso → mensaje específico y reintento', async () => {
    openCamera
      .mockRejectedValueOnce(Object.assign(new Error(), { name: 'NotReadableError' }))
      .mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La cámara está en uso por otra aplicación',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(openCamera).toHaveBeenCalledTimes(2);
  });

  it('al salir de la pantalla apaga la cámara', async () => {
    openCamera.mockResolvedValue(fakeStream);
    const { unmount } = renderScreen();
    await screen.findByText(/Detector activo/);
    unmount();
    await vi.waitFor(() => expect(stop).toHaveBeenCalled());
    expect(recognizerMock.stop).toHaveBeenCalledTimes(1);
  });

  it('panel de estado: cámara activa y modelo no instalado, con enlace a Frases', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Falta un modelo entrenado')).toBeInTheDocument();
    expect(screen.getByText('No instalado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a Frases' })).toHaveAttribute('href', '#/frases');
  });

  it('las señas reconocidas aparecen en "Últimas señas"', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await screen.findByText(/Detector activo/);
    await act(async () => {
      recognizerMock.emitSign({ code: 'hello', confidence: 0.9 });
    });
    expect(screen.getByRole('list', { name: 'Últimas señas' })).toHaveTextContent('Hola');
  });
});
