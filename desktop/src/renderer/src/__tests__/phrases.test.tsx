import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Phrases from '@/routes/Phrases';

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
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
});
