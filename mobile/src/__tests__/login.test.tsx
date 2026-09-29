import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LoginScreen from '@/app/(auth)/login';
import { useSession } from '@/store/session';

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return { Link: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text> };
});

const login = jest.fn();

beforeEach(() => {
  login.mockReset();
  useSession.setState({ login });
});

async function fill(email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), email);
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), password);
}

describe('pantalla de login', () => {
  it('muestra errores de validación en español y no llama al servidor', async () => {
    await render(<LoginScreen />);

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Ingresa tu correo electrónico')).toBeTruthy();
    expect(await screen.findByText('Ingresa tu contraseña')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('rechaza un correo con formato inválido', async () => {
    await render(<LoginScreen />);
    await fill('no-es-correo', 'clave1234');

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('El correo electrónico no es válido')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('envía credenciales normalizadas', async () => {
    login.mockResolvedValue(undefined);
    await render(<LoginScreen />);
    await fill('  Ana@Example.com ', 'clave1234');

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('ana@example.com', 'clave1234'));
  });

  it('muestra un mensaje claro si las credenciales son incorrectas', async () => {
    login.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
    await render(<LoginScreen />);
    await fill('ana@example.com', 'mala12345');

    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Correo o contraseña incorrectos')).toBeTruthy();
  });
});
