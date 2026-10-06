import { create } from 'zustand';

import { authApi, usersApi } from '@/api/endpoints';
import { setAuthFailureHandler } from '@/api/client';
import type { User } from '@/api/types';
import { tokenStorage } from '@/auth/tokenStorage';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

type SessionState = {
  status: Status;
  user: User | null;
  /** Restaura la sesión al arrancar a partir del refresh token guardado. */
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  user: null,

  async restore() {
    const refreshToken = await tokenStorage.getRefreshToken();
    if (!refreshToken) {
      set({ status: 'unauthenticated', user: null });
      return;
    }
    try {
      // Si el access token expiró, el interceptor hace el refresh y reintenta.
      const user = await usersApi.me();
      set({ status: 'authenticated', user });
    } catch {
      // El interceptor ya limpia los tokens si el refresh es rechazado. Un fallo
      // de red aquí también nos deja en login: preferible a una sesión a medias.
      set({ status: 'unauthenticated', user: null });
    }
  },

  async login(email, password) {
    const pair = await authApi.login({ email, password });
    await tokenStorage.save({ accessToken: pair.access_token, refreshToken: pair.refresh_token });
    const user = await usersApi.me();
    set({ status: 'authenticated', user });
  },

  async register(email, password, displayName) {
    await authApi.register({ email, password, display_name: displayName });
    // Tras registrarse iniciamos sesión directamente.
    await useSession.getState().login(email, password);
  },

  async logout() {
    const refreshToken = await tokenStorage.getRefreshToken();
    try {
      // Revoca el refresh token en el servidor. Si falla (sin red), igualmente
      // se cierra la sesión local.
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // ignorado a propósito: ver comentario superior
    } finally {
      await tokenStorage.clear();
      set({ status: 'unauthenticated', user: null });
    }
  },
}));

// Si el refresh falla en cualquier petición, se cierra la sesión local.
setAuthFailureHandler(() => useSession.setState({ status: 'unauthenticated', user: null }));
