import { z } from 'zod';
import { isValidTimezone } from '../../common/utils/time';

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long')
  .refine((val) => /[a-z]/.test(val), 'Password must include a lowercase letter')
  .refine((val) => /[A-Z]/.test(val), 'Password must include an uppercase letter')
  .refine((val) => /[0-9]/.test(val), 'Password must include a number');

const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((tz) => isValidTimezone(tz), 'Invalid IANA timezone identifier');

export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: emailSchema,
    password: passwordSchema,
    timezone: timezoneSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1).max(512),
    // Wire field is `password` (types/auth.ts ResetPasswordInput); mapped internally to
    // `newPassword` to distinguish it clearly from the token in the service layer.
    password: passwordSchema,
  })
  .strict()
  .transform((v) => ({ token: v.token, newPassword: v.password }));

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
