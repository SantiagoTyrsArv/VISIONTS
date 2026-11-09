import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within, type RenderResult } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HashRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Camera from '@/routes/Camera';
import { usePlayback } from '@/store/playback';
import { useSignModel } from '@/store/signModel';

const speak = vi.fn();
const recognizerMock = vi.hoisted(() => ({
  emitSign: vi.fn(),
  emitStatus: vi.fn(),
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
      recognizerMock.emitStatus.mockImplementation(callback);
      callback({ phase: 'ready', handsDetected: false, modelAvailable: false });
      return vi.fn();
    }
    setClassifier = vi.fn();
    onFrame(): () => void {
      return vi.fn();
    }
  },
}));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'hello', text_es: 'Hola', is_default: true },
      { id: '2', code: 'thanks', text_es: 'Gracias', is_default: true },
    ],
  },
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

// La pantalla muestra el estado (role=status) antes de crear el reconocedor: hay que esperar
// a que arranque para que emitSign llegue a la pantalla.
async function recognizerStarted(): Promise<void> {
  await vi.waitFor(() => expect(recognizerMock.start).toHaveBeenCalled());
}

beforeEach(() => {
  speak.mockReset();
  stop.mockReset();
  openCamera.mockReset();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  recognizerMock.emitSign.mockReset();
  recognizerMock.emitStatus.mockReset();
  usePlayback.setState({ lastText: null, playing: false });
  recognizerMock.start.mockReset();
  recognizerMock.stop.mockReset();
  useSignModel.setState({ status: 'error', classifier: null, labels: [], valAccuracy: null });
});

describe('pantalla de cámara', () => {
  it('reproduce una predicción válida del reconocedor', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();

    await act(async () => {
      recognizerMock.emitSign({ code: 'hello', confidence: 0.91 });
    });

    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
  });

  it('ignora códigos de seña que no pertenecen al catálogo', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();

    await act(async () => {
      recognizerMock.emitSign({ code: 'not-in-catalog', confidence: 0.99 });
    });

    expect(speak).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: 'Lo que has dicho' })).toBeNull();
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
    await recognizerStarted();
    unmount();
    await vi.waitFor(() => expect(stop).toHaveBeenCalled());
    expect(recognizerMock.stop).toHaveBeenCalledTimes(1);
  });

  it('con el modelo en error, la cámara avisa y no hay enlace a Entrenar', async () => {
    useSignModel.setState({ status: 'error', classifier: null, labels: [], valAccuracy: null });
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Reconocimiento de señas no disponible',
    );
    expect(screen.getAllByText('Reconocimiento de señas no disponible')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /entrenar/i })).toBeNull();
  });

  it('con el modelo listo muestra cuántas señas reconoce', async () => {
    useSignModel.setState({ status: 'ready', labels: ['hello', 'neutral'] });
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Modelo LSC · 1 señas')).toBeInTheDocument();
  });

  it('las señas reconocidas aparecen en «Lo que has dicho»', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();
    await act(async () => {
      recognizerMock.emitSign({ code: 'hello', confidence: 0.9 });
    });
    expect(screen.getByRole('list', { name: 'Lo que has dicho' })).toHaveTextContent('Hola');
  });

  it('el título es «Tus manos hablan»', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tus manos hablan');
    await recognizerStarted();
  });

  it('la frase rápida «Hola» la dice y la añade a «Lo que has dicho»', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();
    const hola = await screen.findByRole('button', { name: 'Reproducir en voz alta: Hola' });
    expect(hola).toHaveAttribute('aria-keyshortcuts', '1');
    await userEvent.click(hola);
    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
    expect(screen.getByRole('list', { name: 'Lo que has dicho' })).toHaveTextContent('Hola');
  });

  it('la tecla 1 dice la primera frase y la añade a «Lo que has dicho»', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();
    await screen.findByRole('button', { name: 'Reproducir en voz alta: Hola' });
    await userEvent.keyboard('1');
    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
    expect(screen.getByRole('list', { name: 'Lo que has dicho' })).toHaveTextContent('Hola');
  });

  it('«Lo que has dicho» guarda las 5 últimas, la más reciente arriba', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();
    await screen.findByRole('button', { name: 'Reproducir en voz alta: Hola' });
    await userEvent.keyboard('11111');
    await userEvent.keyboard('2');
    const items = within(screen.getByRole('list', { name: 'Lo que has dicho' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('Gracias');
    expect(speak).toHaveBeenCalledTimes(6);
  });

  it('con la cámara en error, la banda de lo que suena no tapa «Reintentar»', async () => {
    usePlayback.setState({ lastText: 'Hola' });
    openCamera.mockRejectedValue(Object.assign(new Error(), { name: 'NotReadableError' }));
    renderScreen();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('Lo último que dijiste')).not.toBeInTheDocument();
  });

  it('con la cámara funcionando, la banda muestra lo último que se dijo', async () => {
    usePlayback.setState({ lastText: 'Hola' });
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();
    expect(screen.getByText('Lo último que dijiste')).toBeInTheDocument();
  });

  it('solo late el punto de las manos detectadas; cámara y modelo quedan quietos', async () => {
    useSignModel.setState({ status: 'ready', labels: ['hello', 'neutral'] });
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    await recognizerStarted();
    await act(async () => {
      recognizerMock.emitStatus({ phase: 'ready', handsDetected: true, modelAvailable: true });
    });
    const dot = (label: string) => {
      const row = screen.getByText(
        (_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith(label),
      );
      return row.querySelector('[aria-hidden]')!.className;
    };
    await vi.waitFor(() => expect(dot('Detección de manos')).toMatch(/dotLive/));
    expect(dot('Cámara')).toMatch(/dotLive/);
    expect(dot('Cámara')).not.toMatch(/dotPulse/);
    expect(dot('Modelo de señas')).toMatch(/dotLive/);
    expect(dot('Modelo de señas')).not.toMatch(/dotPulse/);
    expect(dot('Detección de manos')).toMatch(/dotPulse/);
    expect(screen.getByRole('status').querySelector('[aria-hidden]')!.className).toMatch(
      /dotPulse/,
    );
  });
});
