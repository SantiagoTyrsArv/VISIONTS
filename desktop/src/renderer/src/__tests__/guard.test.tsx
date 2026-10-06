import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';

import { RequireAuth, RequireGuest } from '@/routes/Guard';
import { useSession } from '@/store/session';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireGuest />}>
          <Route path="/login" element={<p>login</p>} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route path="/frases" element={<p>frases</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => useSession.setState({ status: 'loading', user: null }));

describe('guard de rutas', () => {
  it('muestra el splash mientras se restaura la sesión', () => {
    renderAt('/frases');
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  });

  it('sin sesión redirige a login', () => {
    useSession.setState({ status: 'unauthenticated' });
    renderAt('/frases');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('con sesión, login redirige a frases', () => {
    useSession.setState({ status: 'authenticated' });
    renderAt('/login');
    expect(screen.getByText('frases')).toBeInTheDocument();
  });
});
