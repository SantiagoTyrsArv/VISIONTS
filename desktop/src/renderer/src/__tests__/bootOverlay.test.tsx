import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PHRASES_KEY } from '@/api/usePhrases';
import { useSession } from '@/store/session';
import { useSignModel } from '@/store/signModel';
import { BootOverlay, MAX_BOOT_MS, MIN_BOOT_MS } from '@/ui/loading/BootOverlay';

let client: QueryClient;
const realLoad = useSignModel.getState().load;

function mount() {
  render(
    <QueryClientProvider client={client}>
      <BootOverlay />
    </QueryClientProvider>,
  );
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// AnimatePresence completa la salida en un fotograma: se espera a que desmonte.
const gone = () => vi.waitFor(() => expect(overlay()).not.toBeInTheDocument());

const overlay = () => screen.queryByRole('status', { name: 'Cargando SeñaVoz' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSession.setState({ status: 'loading', user: null });
  useSignModel.setState({ status: 'loading', load: realLoad });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BootOverlay', () => {
  it('con la sesión cargando se ve la pantalla de carga', () => {
    mount();
    expect(overlay()).toBeInTheDocument();
  });

  it('sin sesión sale tras el mínimo de 1 200 ms', async () => {
    mount();
    act(() => useSession.setState({ status: 'unauthenticated' }));
    advance(MIN_BOOT_MS);
    await gone();
  });

  it('con modelo y frases en error también sale', async () => {
    client.getQueryCache().build(client, { queryKey: PHRASES_KEY }).setState({ status: 'error' });
    useSignModel.setState({ status: 'error' });
    useSession.setState({ status: 'authenticated' });
    mount();
    advance(MIN_BOOT_MS);
    await gone();
  });

  it('con todo listo a los 100 ms sigue visible a los 1 000 ms', async () => {
    mount();
    advance(100);
    act(() => useSession.setState({ status: 'unauthenticated' }));
    advance(900);
    expect(overlay()).toBeInTheDocument();
    advance(MIN_BOOT_MS);
    await gone();
  });

  it('con frases cargándose no sale aunque pase el mínimo', async () => {
    useSession.setState({ status: 'authenticated' });
    useSignModel.setState({ status: 'ready' });
    mount();
    advance(MIN_BOOT_MS * 2);
    expect(overlay()).toBeInTheDocument();
    act(() => client.setQueryData(PHRASES_KEY, []));
    await gone();
  });

  it('una vez fuera no vuelve a aparecer', async () => {
    mount();
    act(() => useSession.setState({ status: 'unauthenticated' }));
    advance(MIN_BOOT_MS);
    await gone();
    for (const status of ['loading', 'unauthenticated', 'authenticated'] as const) {
      act(() => useSession.setState({ status }));
      advance(MIN_BOOT_MS);
      await gone();
    }
  });

  it('con el modelo atascado sale igualmente al llegar al tope', async () => {
    useSession.setState({ status: 'authenticated' });
    useSignModel.setState({ load: () => new Promise(() => {}) });
    mount();
    advance(MAX_BOOT_MS - 1);
    expect(overlay()).toBeInTheDocument();
    advance(1);
    await gone();
  });

  it('con sesión guardada y arranque en /reunion el modelo se carga y la capa sale', async () => {
    useSession.setState({ status: 'authenticated' });
    client.setQueryData(PHRASES_KEY, []);
    const load = vi.fn(async () => useSignModel.setState({ status: 'ready' }));
    useSignModel.setState({ load });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/reunion']}>
          <BootOverlay />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    advance(MIN_BOOT_MS);
    expect(load).toHaveBeenCalledTimes(1);
    await gone();
  });
});
