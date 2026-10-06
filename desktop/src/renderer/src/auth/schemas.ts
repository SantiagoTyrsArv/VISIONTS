import { z } from 'zod';

import { t } from '@/i18n';

const email = z
  .string()
  .trim()
  .min(1, t('validation.emailRequired'))
  .pipe(z.email(t('validation.emailInvalid')));

// Mismas reglas que el backend: mínimo 8, al menos una letra y un número.
const newPassword = z
  .string()
  .min(8, t('validation.passwordMin'))
  .regex(/[A-Za-z]/, t('validation.passwordFormat'))
  .regex(/\d/, t('validation.passwordFormat'));

export const loginSchema = z.object({
  email,
  password: z.string().min(1, t('validation.passwordRequired')),
});

export const registerSchema = z
  .object({
    displayName: z.string().trim().min(1, t('validation.nameRequired')).max(100),
    email,
    password: newPassword,
    confirmPassword: z.string().min(1, t('validation.confirmPasswordRequired')),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: t('validation.passwordMismatch'),
    path: ['confirmPassword'],
  });

export type LoginForm = z.infer<typeof loginSchema>;
export type RegisterForm = z.infer<typeof registerSchema>;

