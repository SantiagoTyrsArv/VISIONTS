import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';

import { messageForAuthError } from '@/api/errors';
import { loginSchema, type LoginForm } from '@/auth/schemas';
import { t } from '@/i18n';
import { useSession } from '@/store/session';
import { AuthScreen } from '@/ui/AuthScreen';
import { Button } from '@/ui/Button';
import { FormField } from '@/ui/FormField';
import { colors } from '@/ui/theme';

export default function LoginScreen() {
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
      // La navegación la resuelve el guard de rutas al cambiar el estado de sesión.
    } catch (e) {
      setServerError(messageForAuthError(e, 'login'));
    }
  });

  return (
    <AuthScreen title={t('auth.login.title')}>
      <FormField
        control={control}
        name="email"
        label={t('auth.email')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <FormField
        control={control}
        name="password"
        label={t('auth.password')}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
      />
      {serverError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {serverError}
        </Text>
      ) : null}
      <Button
        label={isSubmitting ? t('auth.loading') : t('auth.login.submit')}
        accessibilityLabel={t('auth.login.submit')}
        loading={isSubmitting}
        onPress={onSubmit}
      />
      <Link href="/register" style={styles.link}>
        {t('auth.login.toRegister')}
      </Link>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  link: { color: colors.primary, fontSize: 17, textAlign: 'center', paddingVertical: 12 },
});
