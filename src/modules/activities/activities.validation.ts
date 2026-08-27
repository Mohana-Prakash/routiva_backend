import { z } from 'zod';

export const createActivitySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    categoryId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    alarmEnabled: z.boolean().optional().default(false),
    alarmOffsetMinutes: z.number().int().min(0).max(180).optional().default(5),
  })
  .strict();

export const updateActivitySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    alarmEnabled: z.boolean().optional(),
    alarmOffsetMinutes: z.number().int().min(0).max(180).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, 'At least one field must be provided');

export const activityIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listActivitiesQuerySchema = z
  .object({
    includeInactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    categoryId: z.string().uuid().optional(),
  })
  .strict();

export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;
