import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AnimatePresence } from 'motion/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/App';
import { sessionRoute } from '@/routes/sessionRoute';
import { useMeeting } from '@/store/meeting';
import { useSession } from '@/store/session';
import { PageTransition } from '@/ui/motion/PageTransition';

const motionFlags = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', async (orig) => ({
  ...(await orig<typeof import('motion/react')>()),
  useReducedMotion: () => motionFlags.reduced,
}));

const speak = vi.fn();
vi.mock('@/services/speech', () => ({
  speechService: {
    speak: (...a: unknown[]) => speak(...a),
    stop: vi.fn(),
    warm: vi.fn(async () => undefined),
  },
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
// La cámara y los ajustes tienen sus propias pruebas: aquí solo importa la navegación. La
// cámara real solo se monta en la prueba de atajos (con la webcam y el reconocedor simulados).
const realCamera = vi.hoisted(() => ({ on: false }));
// Cuántas veces se monta cada pantalla simulada: una pantalla saliente no debe montarse de nuevo.
const mounts = vi.hoisted(() => ({ camera: 0, login: 0 }));
function Counted({ name, screen }: Readonly<{ name: keyof typeof mounts; screen: string }>) {
  useEffect(() => {
    mounts[name] += 1;
  }, [name]);
  return <h1>{screen}</h1>;
}
vi.mock('@/routes/Camera', async (orig) => {
  const { default: Camera } = await orig<typeof import('@/routes/Camera')>();
  return {
    default: () =>
      realCamera.on ? <Camera /> : <Counted name="camera" screen="pantalla camara" />,
  };
});
vi.mock('@/services/recognition/MediaPipeSignRecognizer', () => ({
  MediaPipeSignRecognizer: class {
    start = vi.fn();
    stop = vi.fn();
    onSign(): () => void {
      return () => {};
    }
    onStatus(): () => void {
      return () => {};
    }
    setClassifier = vi.fn();
    onFrame(): () => void {
      return () => {};
    }
  },
}));
vi.mock('@/services/camera/camera', async (orig) => ({
  ...(await orig<typeof import('@/services/camera/camera')>()),
  openCamera: async () => ({ getTracks: () => [] }),
  listCameras: async () => [],
}));
vi.mock('@/routes/Settings', () => ({ default: () => <h1>pantalla ajustes</h1> }));
vi.mock('@/routes/Login', () => ({
  default: () => <Counted name="login" screen="pantalla login" />,
}));

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>;
}

function GoToMeeting() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/reunion')}>
      ir a reunión
    </button>
  );
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <Where />
        <GoToMeeting />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  speak.mockReset();
  motionFlags.reduced = false;
  realCamera.on = false;
  useMeeting.setState({ active: false });
  mounts.camera = 0;
  mounts.login = 0;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
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

  it('de Frases a Señas, pulsar 3 justo después habla una sola vez', async () => {
    realCamera.on = true;
    const user = userEvent.setup();
    renderAt('/frases');
    const nav = await screen.findByRole('navigation');
    await screen.findByRole('button', { name: 'Reproducir en voz alta: Tres' });
    await user.click(within(nav).getByRole('link', { name: 'Señas' }));
    await screen.findByRole('heading', { level: 1, name: 'Tus manos hablan' });
    await user.keyboard('3');
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Tres' }));
    // Ni la pantalla saliente ni un segundo oyente repiten la frase.
    await new Promise((r) => setTimeout(r, 50));
    expect(speak).toHaveBeenCalledTimes(1);
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

  it('al iniciar sesión, el acceso no se vuelve a montar mientras sale', async () => {
    useSession.setState({ status: 'unauthenticated' });
    renderAt('/login');
    await screen.findByText('pantalla login');
    act(() => useSession.setState({ status: 'authenticated' }));
    expect(await screen.findByText('pantalla camara')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/camara');
    expect(mounts.login).toBe(1);
  });

  it('al cerrar sesión, la pantalla saliente no se vuelve a montar mientras sale', async () => {
    renderAt('/camara');
    await screen.findByText('pantalla camara');
    act(() => useSession.setState({ status: 'unauthenticated' }));
    expect(await screen.findByText('pantalla login')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/login');
    expect(mounts.camera).toBe(1);
  });

  it('al cambiar de pantalla la nueva empieza arriba del todo', async () => {
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    const user = userEvent.setup();
    renderAt('/frases');
    const nav = await screen.findByRole('navigation');
    expect(scrollTo).not.toHaveBeenCalled();
    await user.click(within(nav).getByRole('link', { name: 'Ajustes' }));
    expect(await screen.findByText('pantalla ajustes')).toBeInTheDocument();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 0 }));
    expect(scrollTo.mock.contexts[0]).toBe(screen.getByRole('main'));
  });

  it('con sesión, /login lleva a /camara', async () => {
    renderAt('/login');
    expect(await screen.findByText('pantalla camara')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/camara');
  });
});

describe('entrar en la reunión', () => {
  it('la pantalla principal sale al instante hacia la reunión', async () => {
    renderAt('/camara');
    const nav = await screen.findByRole('navigation');
    expect(nav.closest('[data-exit-duration]')).toHaveAttribute('data-exit-duration', '0.15');
    act(() => {
      useMeeting.setState({ active: true });
      fireEvent.click(screen.getByRole('button', { name: 'ir a reunión' }));
    });
    expect(nav.closest('[data-exit-duration]')).toHaveAttribute('data-exit-duration', '0');
  });
});

describe('ruta según la sesión', () => {
  it('mientras se restaura la sesión no pinta ni login ni la ruta', () => {
    useSession.setState({ status: 'loading' });
    renderAt('/camara');
    expect(screen.queryByText('pantalla login')).not.toBeInTheDocument();
    expect(screen.queryByText('pantalla camara')).not.toBeInTheDocument();
  });

  it.each([
    ['/camara', 'loading', 'loading', null],
    ['/camara', 'unauthenticated', '/login', '/login'],
    ['/reunion', 'unauthenticated', '/login', '/login'],
    ['/register', 'unauthenticated', '/register', null],
    ['/login', 'authenticated', 'app', '/camara'],
    ['/register', 'authenticated', 'app', '/camara'],
    ['/frases', 'authenticated', 'app', null],
    ['/reunion', 'authenticated', '/reunion', null],
  ] as const)('%s con sesión %s → grupo %s, redirige a %s', (path, status, group, redirect) => {
    expect(sessionRoute(path, status)).toEqual({ group, redirect });
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

  it('sin desplazamiento (cambio entre grupos de rutas) solo funde', () => {
    const { container } = render(<PageTransition shift={false}>x</PageTransition>);
    expect(container.firstElementChild).toHaveAttribute('data-shift', '0');
  });

  it('instant (reunión) no anima', () => {
    const { container } = render(<PageTransition instant>x</PageTransition>);
    expect(container.firstElementChild).toHaveAttribute('data-duration', '0');
  });

  // `custom` de AnimatePresence: el destino cambia sin animar (la reunión).
  function Swap({ page, toInstant }: Readonly<{ page: string; toInstant: boolean }>) {
    return (
      <AnimatePresence mode="wait" initial={false} custom={toInstant}>
        <PageTransition key={page}>{page}</PageTransition>
      </AnimatePresence>
    );
  }

  it('la pantalla que sale hacia la reunión lo hace al instante', () => {
    const { rerender } = render(<Swap page="señas" toInstant={false} />);
    rerender(<Swap page="reunión" toInstant />);
    expect(screen.getByText('señas')).toHaveAttribute('data-exit-duration', '0');
  });

  it('entre pantallas normales la salida dura 150 ms', () => {
    const { rerender } = render(<Swap page="señas" toInstant={false} />);
    rerender(<Swap page="frases" toInstant={false} />);
    expect(screen.getByText('señas')).toHaveAttribute('data-exit-duration', '0.15');
  });
});
