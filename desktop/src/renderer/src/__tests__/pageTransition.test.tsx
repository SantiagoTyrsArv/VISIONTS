import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageTransition } from '@/ui/motion/PageTransition';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/App';
import { useSession } from '@/store/session';

const motionFlags = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', async (orig) => ({
  ...(await orig<typeof import('motion/react')>()),
  useReducedMotion: () => motionFlags.reduced,
}));

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: { speak: (...a: unknown[]) => speak(...a), stop: vi.fn() },
}));
vi.mock('@/api/endpoints', () => ({
  phrasesApi: {
    list: async () => [
      { id: '1', code: 'a', text_es: 'Uno', is_default: true },
      { id: '2', code: 'b', text_es: 'Dos', is_default: true },
      { id: '3', code: 'c', text_es: 'Tres', is_default: true },
    ],
  },
}));
// La cámara y los ajustes tienen sus propias pruebas: aquí solo importa la navegación.
vi.mock('@/routes/Camera', () => ({ default: () => <h1>pantalla camara</h1> }));
vi.mock('@/routes/Settings', () => ({ default: () => <h1>pantalla ajustes</h1> }));
vi.mock('@/routes/Login', () => ({ default: () => <h1>pantalla login</h1> }));

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  speak.mockReset();
  motionFlags.reduced = false;
  useSession.setState({ status: 'authenticated', user: null });
});

describe('transiciones entre pantallas', () => {
  it('con sesión, la raíz lleva a /camara', async () => {
    renderAt('/');
    expect(await screen.findByText('pantalla camara')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/camara');
  });

  it('el primer enlace de la navegación es «Señas»', async () => {
    renderAt('/camara');
    const nav = await screen.findByRole('navigation');
    expect(within(nav).getAllByRole('link')[0]).toHaveAccessibleName('Señas');
  });

  it('cambiar de pantalla no vuelve a montar la barra lateral', async () => {
    const user = userEvent.setup();
    renderAt('/frases');
    const nav = await screen.findByRole('navigation');
    await user.click(within(nav).getByRole('link', { name: 'Señas' }));
    expect(await screen.findByText('pantalla camara')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toBe(nav);
  });

  it('sin sesión, /camara lleva a login', async () => {
    useSession.setState({ status: 'unauthenticated' });
    renderAt('/camara');
    expect(await screen.findByText('pantalla login')).toBeInTheDocument();
  });

  it('pulsar 3 tras cambiar de pantalla habla una sola vez', async () => {
    const user = userEvent.setup();
    renderAt('/ajustes');
    const nav = await screen.findByRole('navigation');
    await screen.findByText('pantalla ajustes');
    await user.click(within(nav).getByRole('link', { name: 'Frases' }));
    await screen.findByRole('button', { name: 'Reproducir en voz alta: Tres' });
    await user.keyboard('3');
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Tres' }));
  });

  it('al iniciar sesión, el acceso sigue en pantalla mientras se desvanece', async () => {
    useSession.setState({ status: 'unauthenticated' });
    renderAt('/login');
    await screen.findByText('pantalla login');
    act(() => useSession.setState({ status: 'authenticated' }));
    // Justo después del cambio la pantalla saliente aún está: no se corta a vacío.
    expect(screen.getByText('pantalla login')).toBeInTheDocument();
    expect(await screen.findByText('pantalla camara')).toBeInTheDocument();
    expect(screen.queryByText('pantalla login')).not.toBeInTheDocument();
  });

  it('al cerrar sesión, la pantalla saliente sigue en pantalla mientras se desvanece', async () => {
    renderAt('/camara');
    await screen.findByText('pantalla camara');
    act(() => useSession.setState({ status: 'unauthenticated' }));
    expect(screen.getByText('pantalla camara')).toBeInTheDocument();
    expect(await screen.findByText('pantalla login')).toBeInTheDocument();
  });
});

describe('PageTransition', () => {
  it('dura 150 ms por tramo', () => {
    const { container } = render(<PageTransition>x</PageTransition>);
    expect(container.firstElementChild).toHaveAttribute('data-duration', '0.15');
  });

  it('con movimiento reducido cambia al instante', () => {
    motionFlags.reduced = true;
    const { container } = render(<PageTransition>x</PageTransition>);
    expect(container.firstElementChild).toHaveAttribute('data-duration', '0');
  });

  it('instant (reunión) no anima', () => {
    const { container } = render(<PageTransition instant>x</PageTransition>);
    expect(container.firstElementChild).toHaveAttribute('data-duration', '0');
  });
});
