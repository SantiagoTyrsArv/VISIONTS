import { http } from './client';
import type { Phrase, TokenPair, User } from './types';

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
