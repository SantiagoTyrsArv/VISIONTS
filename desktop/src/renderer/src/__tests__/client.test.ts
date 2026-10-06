import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { tokenStorage } from '@/auth/tokenStorage';

let refreshCalls = 0;
// 'ok' | código HTTP con el que falla el refresh | 'network' (sin respuesta)
let refreshMode: 'ok' | 401 | 500 | 'network' = 'ok';
let retryShouldFail = false;

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}) {
  const response = { data, status, statusText: '', headers: {}, config };
  if (status >= 400) {
    return Promise.reject(new AxiosError('fail', 'ERR_BAD_REQUEST', config, null, response));
  }
  return Promise.resolve(response);
}

// Adaptador falso a nivel global: las instancias creadas por el cliente lo heredan.
axios.defaults.adapter = (config: InternalAxiosRequestConfig) => {
  if (config.url === '/auth/refresh') {
    refreshCalls += 1;
    if (refreshMode === 'network') {
      return Promise.reject(new AxiosError('Network Error', 'ERR_NETWORK', config, null));
    }
    if (refreshMode !== 'ok') return respond(config, refreshMode);
    return respond(config, 200, { access_token: 'new-access', refresh_token: 'new-refresh' });
  }
  const auth = config.headers.get('Authorization');
  if (auth !== 'Bearer new-access') return respond(config, 401);
  return retryShouldFail ? respond(config, 500) : respond(config, 200, { ok: true });
};

const { http, setAuthFailureHandler } = await import('@/api/client');

beforeEach(async () => {
  refreshCalls = 0;
  refreshMode = 'ok';
  retryShouldFail = false;
  await tokenStorage.save({ accessToken: 'expired', refreshToken: 'old-refresh' });
});

describe('cliente HTTP', () => {
  it('ante varios 401 concurrentes hace UN solo refresh y reintenta todos', async () => {
    const results = await Promise.all([http.get('/a'), http.get('/b'), http.get('/c')]);

    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
    expect(await tokenStorage.getAccessToken()).toBe('new-access');
    expect(await tokenStorage.getRefreshToken()).toBe('new-refresh');
  });

  it('si el refresh falla, limpia tokens y notifica el cierre de sesión', async () => {
    refreshMode = 401;
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);

    await expect(http.get('/a')).rejects.toBeTruthy();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(await tokenStorage.getRefreshToken()).toBeNull();
  });

  it.each(['network', 500] as const)(
    'si el refresh falla sin rechazo de credenciales (%s), conserva la sesión',
    async (mode) => {
      refreshMode = mode;
      const onFailure = vi.fn();
      setAuthFailureHandler(onFailure);

      await expect(http.get('/a')).rejects.toBeTruthy();

      expect(onFailure).not.toHaveBeenCalled();
      expect(await tokenStorage.getRefreshToken()).toBe('old-refresh');
    },
  );

  it('si el reintento falla tras un refresh correcto, conserva los tokens nuevos', async () => {
    retryShouldFail = true;
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);

    await expect(http.get('/a')).rejects.toMatchObject({ response: { status: 500 } });

    expect(onFailure).not.toHaveBeenCalled();
    expect(await tokenStorage.getRefreshToken()).toBe('new-refresh');
  });
});
