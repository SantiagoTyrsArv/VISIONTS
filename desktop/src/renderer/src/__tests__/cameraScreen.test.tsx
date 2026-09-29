import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Camera from '@/routes/Camera';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
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

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Camera />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  speak.mockReset();
  stop.mockReset();
  openCamera.mockReset();
});

describe('pantalla de cámara', () => {
  it('muestra el aviso y la simulación reproduce la frase', async () => {
    openCamera.mockResolvedValue(fakeStream);
    renderScreen();
    expect(await screen.findByText('Reconocimiento de señas: próximamente')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Simular seña: Hola' }));

    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
    expect(screen.getByText('Seña detectada: Hola')).toBeInTheDocument();
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
    await screen.findByText('Reconocimiento de señas: próximamente');
    unmount();
    await vi.waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
