import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';

import { t } from '@/i18n';
import { AuthScreen } from '@/ui/AuthScreen';
import { Button } from '@/ui/Button';
import { FormField } from '@/ui/FormField';

import styles from './routes.module.css';

const forgotSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, t('validation.emailRequired'))
    .pipe(z.email(t('validation.emailInvalid'))),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    getValues,
    formState: { isSubmitting },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    try {
      // TODO (Fase 2): llamar a POST /auth/forgot-password con { email }
      // Por ahora simulamos un retardo de red para que el flujo de UI sea real.
      await new Promise((r) => setTimeout(r, 800));
      void email; // el backend recibirá el correo cuando esté implementado
      setSent(true);
    } catch {
      setServerError(t('error.generic'));
    }
  });

  if (sent) {
    return (
      <AuthScreen title={t('auth.forgot.sentTitle')}>
        <div className={styles.sentBox}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.sentIcon}
            aria-hidden="true"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <p className={styles.sentText}>{t('auth.forgot.sentBody')}</p>
          <p className={styles.sentEmail}>{getValues('email')}</p>
        </div>
        <Link to="/login" className={styles.link}>
          {t('auth.forgot.backToLogin')}
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={t('auth.forgot.title')}>
      <p className={styles.forgotHint}>{t('auth.forgot.hint')}</p>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <FormField
          control={control}
          name="email"
          label={t('auth.email')}
          type="email"
          autoComplete="email"
        />
        {serverError ? (
          <p role="alert" className={styles.error}>
            {serverError}
          </p>
        ) : null}
        <Button
          type="submit"
          label={isSubmitting ? t('auth.loading') : t('auth.forgot.submit')}
          ariaLabel={t('auth.forgot.submit')}
          loading={isSubmitting}
        />
      </form>
      <Link to="/login" className={styles.link}>
        {t('auth.forgot.backToLogin')}
      </Link>
    </AuthScreen>
  );
}
