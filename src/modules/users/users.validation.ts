import { z } from 'zod';
import { isValidTimezone } from '../../common/utils/time';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine((tz) => isValidTimezone(tz), 'Invalid IANA timezone identifier')
      .optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, 'At least one field must be provided');

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
