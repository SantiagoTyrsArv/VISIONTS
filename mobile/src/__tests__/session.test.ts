import { authApi, usersApi } from '@/api/endpoints';
import { tokenStorage } from '@/auth/tokenStorage';
import { useSession } from '@/store/session';

jest.mock('@/api/endpoints', () => ({
  authApi: { login: jest.fn(), register: jest.fn(), logout: jest.fn() },
  usersApi: { me: jest.fn() },
}));

const user = {
  id: '1',
  email: 'ana@example.com',
  display_name: 'Ana',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

beforeEach(async () => {
  jest.clearAllMocks();
  await tokenStorage.clear();
  useSession.setState({ status: 'loading', user: null });
});

describe('sesión', () => {
  it('login guarda los tokens en el almacén seguro y autentica', async () => {
    (authApi.login as jest.Mock).mockResolvedValue({ access_token: 'a1', refresh_token: 'r1' });
    (usersApi.me as jest.Mock).mockResolvedValue(user);

    await useSession.getState().login('ana@example.com', 'clave1234');

    expect(await tokenStorage.getAccessToken()).toBe('a1');
    expect(await tokenStorage.getRefreshToken()).toBe('r1');
    expect(useSession.getState()).toMatchObject({ status: 'authenticated', user });
  });

  it('login fallido no deja tokens ni sesión', async () => {
    (authApi.login as jest.Mock).mockRejectedValue(new Error('401'));

    await expect(useSession.getState().login('a@b.com', 'x')).rejects.toThrow();

    expect(await tokenStorage.getRefreshToken()).toBeNull();
    expect(useSession.getState().status).not.toBe('authenticated');
  });

  it('restore sin refresh token va a no autenticado', async () => {
    await useSession.getState().restore();
    expect(useSession.getState().status).toBe('unauthenticated');
    expect(usersApi.me).not.toHaveBeenCalled();
  });

  it('restore con refresh token restaura la sesión', async () => {
    await tokenStorage.save({ accessToken: 'a', refreshToken: 'r' });
    (usersApi.me as jest.Mock).mockResolvedValue(user);

    await useSession.getState().restore();

    expect(useSession.getState()).toMatchObject({ status: 'authenticated', user });
  });

  it('restore con sesión inválida va a no autenticado', async () => {
    await tokenStorage.save({ accessToken: 'a', refreshToken: 'r' });
    (usersApi.me as jest.Mock).mockRejectedValue(new Error('401'));

    await useSession.getState().restore();

    expect(useSession.getState().status).toBe('unauthenticated');
  });

  it('logout revoca el refresh token en el servidor y limpia el almacén', async () => {
    await tokenStorage.save({ accessToken: 'a', refreshToken: 'r-secret' });
    useSession.setState({ status: 'authenticated', user });
    (authApi.logout as jest.Mock).mockResolvedValue(undefined);

    await useSession.getState().logout();

    expect(authApi.logout).toHaveBeenCalledWith('r-secret');
    expect(await tokenStorage.getRefreshToken()).toBeNull();
    expect(useSession.getState()).toMatchObject({ status: 'unauthenticated', user: null });
  });

  it('logout cierra la sesión local aunque el servidor no responda', async () => {
    await tokenStorage.save({ accessToken: 'a', refreshToken: 'r' });
    (authApi.logout as jest.Mock).mockRejectedValue(new Error('network'));

    await useSession.getState().logout();

    expect(await tokenStorage.getRefreshToken()).toBeNull();
    expect(useSession.getState().status).toBe('unauthenticated');
  });
});
