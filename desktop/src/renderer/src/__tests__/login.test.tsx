import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Login from '@/routes/Login';
import { useSession } from '@/store/session';

const login = vi.fn();

beforeEach(() => {
  login.mockReset();
  useSession.setState({ login });
});

function setup() {
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function fill(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText('Correo electrónico'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
}

describe('pantalla de login', () => {
  it('muestra errores de validación en español y no llama al servidor', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Ingresa tu correo electrónico')).toBeInTheDocument();
    expect(await screen.findByText('Ingresa tu contraseña')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('rechaza un correo con formato inválido', async () => {
    const user = setup();
    await fill(user, 'no-es-correo', 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('El correo electrónico no es válido')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('envía credenciales normalizadas', async () => {
    login.mockResolvedValue(undefined);
    const user = setup();
    await fill(user, '  Ana@Example.com ', 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('ana@example.com', 'clave1234'));
  });

  it('muestra un mensaje claro si las credenciales son incorrectas', async () => {
    login.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    const user = setup();
    await fill(user, 'ana@example.com', 'mala12345');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
  });

  it('muestra un error de red si el servidor no responde', async () => {
    login.mockRejectedValue({ isAxiosError: true });
    const user = setup();
    await fill(user, 'ana@example.com', 'clave1234');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo conectar con el servidor',
    );
  });
});
