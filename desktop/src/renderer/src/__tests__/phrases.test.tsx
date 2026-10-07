import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Phrases from '@/routes/Phrases';
import { usePlayback } from '@/store/playback';

const speak = vi.fn();
const stop = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: () => stop() },
}));
const list = vi.fn();
vi.mock('@/api/endpoints', () => ({ phrasesApi: { list: () => list() } }));

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Phrases />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  speak.mockReset();
  stop.mockReset();
  usePlayback.setState({ lastText: null, playing: false });
  list.mockReset();
});

describe('pantalla de frases', () => {
  it('clic en una tarjeta reproduce la frase', async () => {
    list.mockResolvedValue([{ id: '1', code: 'hello', text_es: 'Hola', is_default: true }]);
    renderScreen();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Reproducir en voz alta: Hola' }),
    );
    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
  });

  it('la tecla 1 reproduce la primera frase', async () => {
    list.mockResolvedValue([{ id: '1', code: 'hello', text_es: 'Hola', is_default: true }]);
    renderScreen();
    await screen.findByRole('button', { name: 'Reproducir en voz alta: Hola' });
    await userEvent.keyboard('1');
    expect(speak).toHaveBeenCalledWith({ code: 'hello', text: 'Hola' });
  });

  it('si falla la carga muestra error y permite reintentar', async () => {
    list.mockRejectedValueOnce(new Error('red')).mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('No se pudieron cargar las frases')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('la franja "Sonando ahora" muestra la última frase y Detener la corta', async () => {
    list.mockResolvedValue([{ id: '1', code: 'hello', text_es: 'Hola', is_default: true }]);
    usePlayback.setState({ lastText: 'Hola', playing: true });
    renderScreen();
    expect(await screen.findByText('Sonando ahora')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Detener' }));
    expect(stop).toHaveBeenCalled();
  });

  it('indica que fuera del Modo reunión suena por los altavoces', async () => {
    list.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('Altavoces')).toBeInTheDocument();
  });
});
