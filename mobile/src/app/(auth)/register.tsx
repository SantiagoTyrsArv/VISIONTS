import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';

import { messageForAuthError } from '@/api/errors';
import { registerSchema, type RegisterForm } from '@/auth/schemas';
import { t } from '@/i18n';
import { useSession } from '@/store/session';
import { AuthScreen } from '@/ui/AuthScreen';
import { Button } from '@/ui/Button';
import { FormField } from '@/ui/FormField';
import { colors } from '@/ui/theme';

export default function RegisterScreen() {
  const register = useSession((s) => s.register);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '' },
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
        autoComplete="new-password"
      />
      {serverError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {serverError}
        </Text>
      ) : null}
      <Button
        label={isSubmitting ? t('auth.loading') : t('auth.register.submit')}
        accessibilityLabel={t('auth.register.submit')}
        loading={isSubmitting}
        onPress={onSubmit}
      />
      <Link href="/login" style={styles.link}>
        {t('auth.register.toLogin')}
      </Link>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  link: { color: colors.primary, fontSize: 17, textAlign: 'center', paddingVertical: 12 },
});
