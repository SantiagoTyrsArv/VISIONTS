import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { messageForAuthError } from '@/api/errors';
import { loginSchema, type LoginForm } from '@/auth/schemas';
import { t } from '@/i18n';
import { useSession } from '@/store/session';
import { AuthScreen } from '@/ui/AuthScreen';
import { Button } from '@/ui/Button';
import { FormField } from '@/ui/FormField';

import styles from './routes.module.css';

export default function Login() {
  const login = useSession((s) => s.login);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    try {
      await login(email.trim().toLowerCase(), password);
      // La navegación la resuelve el guard al cambiar el estado de sesión.
    } catch (e) {
      setServerError(messageForAuthError(e, 'login'));
    }
  });

  return (
    <AuthScreen title={t('auth.login.title')}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField
          control={control}
          name="email"
          label={t('auth.email')}
          type="email"
          autoComplete="email"
        />
        <FormField
          control={control}
          name="password"
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
        />
        <Link to="/forgot-password" className={styles.linkSmall}>
          {t('auth.login.forgotPassword')}
        </Link>
        {serverError ? (
          <p role="alert" className={styles.error}>
            {serverError}
          </p>
        ) : null}
        <Button
          type="submit"
          label={isSubmitting ? t('auth.loading') : t('auth.login.submit')}
          ariaLabel={t('auth.login.submit')}
          loading={isSubmitting}
        />
      </form>
      <Link to="/register" className={styles.link}>
        {t('auth.login.toRegister')}
      </Link>
    </AuthScreen>
  );
}
