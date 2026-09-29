import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import { tokenStorage } from '@/auth/tokenStorage';

let refreshCalls = 0;
let refreshShouldFail = false;

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
    if (refreshShouldFail) return respond(config, 401);
    return respond(config, 200, { access_token: 'new-access', refresh_token: 'new-refresh' });
  }
  const auth = config.headers.get('Authorization');
  return auth === 'Bearer new-access' ? respond(config, 200, { ok: true }) : respond(config, 401);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { http, setAuthFailureHandler } = require('@/api/client') as typeof import('@/api/client');

beforeEach(async () => {
  refreshCalls = 0;
  refreshShouldFail = false;
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
    refreshShouldFail = true;
    const onFailure = jest.fn();
    setAuthFailureHandler(onFailure);

    await expect(http.get('/a')).rejects.toBeTruthy();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(await tokenStorage.getRefreshToken()).toBeNull();
  });
});
