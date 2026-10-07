import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { tokenStorage } from '@/auth/tokenStorage';
import { API_URL } from '@/config/env';

import type { TokenPair } from './types';

export const http = axios.create({ baseURL: API_URL, timeout: 15000 });

// Cliente "limpio" sin interceptores, para /auth/refresh (evita bucles).
const bare = axios.create({ baseURL: API_URL, timeout: 15000 });

let onAuthFailure: () => void = () => {};

/** El store de sesión registra aquí qué hacer cuando ya no se puede refrescar. */
export function setAuthFailureHandler(handler: () => void): void {
  onAuthFailure = handler;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// Una sola petición de refresh en vuelo; las demás 401 concurrentes esperan
// a la misma promesa (la "cola") y luego reintentan con el token nuevo.
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) throw new Error('no-refresh-token');
  const { data } = await bare.post<TokenPair>('/auth/refresh', { refresh_token: refreshToken });
  await tokenStorage.save({ accessToken: data.access_token, refreshToken: data.refresh_token });
  return data.access_token;
}

http.interceptors.request.use(async (config) => {
  const token = await tokenStorage.getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const isAuthEndpoint = original?.url?.startsWith('/auth/');

    if (error.response?.status !== 401 || !original || original._retried || isAuthEndpoint) {
      throw error;
    }
    original._retried = true;

    let newToken: string;
    try {
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      newToken = await refreshInFlight;
    } catch (refreshError) {
      // Solo se cierra la sesión si el servidor rechaza las credenciales; ante un
      // fallo de red o un 5xx se conservan los tokens para reintentar más tarde.
      if (isCredentialRejection(refreshError)) {
        await tokenStorage.clear();
        onAuthFailure();
      }
      throw error;
    }

    // Un fallo del reintento (p. ej. 500) se propaga tal cual: los tokens nuevos son válidos.
    original.headers.set('Authorization', `Bearer ${newToken}`);
    return http(original);
  },
);

function isCredentialRejection(error: unknown): boolean {
  if (error instanceof Error && error.message === 'no-refresh-token') return true;
  const status = apiErrorStatus(error);
  return status === 401 || status === 403;
}

/** Código HTTP de un error de axios (undefined si no hubo respuesta). */
export function apiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}
