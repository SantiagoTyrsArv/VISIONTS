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
          <Route path="/camara" element={<p>camara</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => useSession.setState({ status: 'loading', user: null }));

describe('guard de rutas', () => {
  it('mientras carga no pinta ni login ni la ruta', () => {
    renderAt('/camara');
    expect(screen.queryByText('login')).not.toBeInTheDocument();
    expect(screen.queryByText('camara')).not.toBeInTheDocument();
  });

  it('sin sesión redirige a login', () => {
    useSession.setState({ status: 'unauthenticated' });
    renderAt('/camara');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('con sesión, login redirige a camara', () => {
    useSession.setState({ status: 'authenticated' });
    renderAt('/login');
    expect(screen.getByText('camara')).toBeInTheDocument();
  });
});
