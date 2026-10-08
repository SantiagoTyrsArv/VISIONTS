import { http } from './client';
import type { ModelStatus, Phrase, SampleSummary, TokenPair, User } from './types';

export const authApi = {
  register: (body: { email: string; password: string; display_name: string }) =>
    http.post<User>('/auth/register', body).then((r) => r.data),

  login: (body: { email: string; password: string }) =>
    http.post<TokenPair>('/auth/login', body).then((r) => r.data),

  logout: (refreshToken: string) =>
    http.post('/auth/logout', { refresh_token: refreshToken }).then(() => undefined),
};

export const usersApi = {
  me: () => http.get<User>('/users/me').then((r) => r.data),
};

export const phrasesApi = {
  list: () => http.get<Phrase[]>('/phrases').then((r) => r.data),
};

export const SAMPLES_KEY = ['samples-summary'] as const;

export const samplesApi = {
  create: (label: string, frames: number[]) =>
    http.post<{ id: string }>('/samples', { label, frames }).then((r) => r.data),
  summary: () => http.get<SampleSummary>('/samples/summary').then((r) => r.data),
  /** Sin etiqueta borra todas las muestras y los modelos del usuario. */
  remove: (label?: string) =>
    http.delete('/samples', { params: label ? { label } : undefined }).then(() => undefined),
};

export const modelsApi = {
  train: () => http.post<{ id: string; status: string }>('/models/train').then((r) => r.data),
  status: () => http.get<ModelStatus>('/models/status').then((r) => r.data),
  // Los pesos solo viven en memoria: se piden sin caché (el servidor responde no-store).
  weights: () =>
    http
      .get<unknown>('/models/ready/weights', { headers: { 'Cache-Control': 'no-store' } })
      .then((r) => r.data),
};
