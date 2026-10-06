import { t } from '@/i18n';

import { apiErrorStatus, isNetworkError } from './client';

/** Traduce un error de la API a un mensaje claro en español. */
export function messageForAuthError(error: unknown, context: 'login' | 'register'): string {
  if (isNetworkError(error)) return t('error.network');
  const status = apiErrorStatus(error);
  if (status === 401) return t('error.invalidCredentials');
  if (status === 409) return t('error.emailTaken');
  if (status === 429) return t('error.tooManyRequests');
  if (status === 422 && context === 'register') return t('validation.passwordFormat');
  return t('error.generic');
}
