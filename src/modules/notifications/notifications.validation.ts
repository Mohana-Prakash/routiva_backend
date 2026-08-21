import { z } from 'zod';

export const subscribeSchema = z
  .object({
    endpoint: z.string().url().max(1000),
    keys: z
      .object({
        p256dh: z.string().min(1).max(512),
        auth: z.string().min(1).max(512),
      })
      .strict(),
    userAgent: z.string().max(500).optional(),
  })
  .strict();

export const unsubscribeSchema = z
  .object({
    endpoint: z.string().url().max(1000),
  })
  .strict();

export const updatePreferencesSchema = z
  .object({
    pushEnabled: z.boolean().optional(),
    // Wire field name is `defaultAlarmOffsetMinutes` (types/notification.ts); mapped to our
    // internal `defaultAlarmOffset` column name.
    defaultAlarmOffsetMinutes: z.number().int().min(0).max(180).optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .nullable()
      .optional(),
    quietHoursEnd: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided')
  .refine((v) => !v.quietHoursEnabled || (v.quietHoursStart !== undefined && v.quietHoursEnd !== undefined), {
    message: 'quietHoursStart and quietHoursEnd are required when enabling quiet hours',
  })
  .transform((v) => ({
    pushEnabled: v.pushEnabled,
    defaultAlarmOffset: v.defaultAlarmOffsetMinutes,
    quietHoursEnabled: v.quietHoursEnabled,
    quietHoursStart: v.quietHoursStart,
    quietHoursEnd: v.quietHoursEnd,
  }));

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
