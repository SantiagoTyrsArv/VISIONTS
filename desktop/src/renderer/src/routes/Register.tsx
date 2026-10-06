import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { messageForAuthError } from '@/api/errors';
import { registerSchema, type RegisterForm } from '@/auth/schemas';
import { t } from '@/i18n';
import { useSession } from '@/store/session';
import { AuthScreen } from '@/ui/AuthScreen';
import { Button } from '@/ui/Button';
import { FormField } from '@/ui/FormField';

import styles from './routes.module.css';

export default function Register() {
  const register = useSession((s) => s.register);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ displayName, email, password }) => {
    setServerError(null);
    try {
      await register(email.trim().toLowerCase(), password, displayName.trim());
    } catch (e) {
      setServerError(messageForAuthError(e, 'register'));
    }
  });

  return (
    <AuthScreen title={t('auth.register.title')}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField
          control={control}
          name="displayName"
          label={t('auth.displayName')}
          autoComplete="name"
        />
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
          autoComplete="new-password"
        />
        <FormField
          control={control}
          name="confirmPassword"
          label={t('auth.confirmPassword')}
          type="password"
          autoComplete="new-password"
        />
        {serverError ? (
          <p role="alert" className={styles.error}>
            {serverError}
          </p>
        ) : null}
        <Button
          type="submit"
          label={isSubmitting ? t('auth.loading') : t('auth.register.submit')}
          ariaLabel={t('auth.register.submit')}
          loading={isSubmitting}
        />
      </form>
      <Link to="/login" className={styles.link}>
        {t('auth.register.toLogin')}
      </Link>
    </AuthScreen>
  );
}

