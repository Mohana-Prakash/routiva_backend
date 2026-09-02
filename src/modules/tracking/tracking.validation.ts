import { z } from 'zod';
import { isValidDateString } from '../../common/utils/time';

const dateString = z.string().refine(isValidDateString, 'Must be YYYY-MM-DD');

export const logIdParamSchema = z.object({ id: z.string().uuid() });

export const listLogsQuerySchema = z
  .object({
    from: dateString.optional(),
    to: dateString.optional(),
    date: dateString.optional(),
    status: z.enum(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'MISSED', 'ADJUSTED']).optional(),
    activityId: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().max(100000).optional().default(1),
    limit: z.coerce.number().int().positive().max(100).optional().default(50),
  })
  .strict()
  .refine((v) => v.date || (v.from && v.to) || (!v.from && !v.to), {
    message: 'Provide either "date" or both "from" and "to"',
  });

export const correctLogSchema = z
  .object({
    actualStart: z.string().datetime().optional(),
    actualEnd: z.string().datetime().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

// Optional actual start/end for the in-app "how long did you actually spend on this"
// completion prompt. Omitted entirely (e.g. the service worker's headless notification-button
// completion, which can't show a prompt) falls back to the simple one-tap default in
// trackingService.complete.
export const completeLogSchema = z
  .object({
    actualStart: z.string().datetime().optional(),
    actualEnd: z.string().datetime().optional(),
  })
  .strict()
  .refine((v) => (!!v.actualStart) === (!!v.actualEnd), {
    message: 'Provide both actualStart and actualEnd, or neither',
  });

// Correcting an already-resolved log to a different resolved outcome (e.g. tapped Complete by
// mistake, meant Skip). Only ever moves between COMPLETED/SKIPPED/MISSED — never touches
// PLANNED/IN_PROGRESS, which have their own dedicated start/skip/complete actions.
export const reclassifyLogSchema = z
  .object({
    status: z.enum(['COMPLETED', 'SKIPPED', 'MISSED']),
    actualStart: z.string().datetime().optional(),
    actualEnd: z.string().datetime().optional(),
  })
  .strict()
  .refine((v) => (!!v.actualStart) === (!!v.actualEnd), {
    message: 'Provide both actualStart and actualEnd, or neither',
  })
  .refine((v) => v.status === 'COMPLETED' || (!v.actualStart && !v.actualEnd), {
    message: 'actualStart/actualEnd only apply when status is COMPLETED',
  });

export const dailySummaryQuerySchema = z
  .object({
    date: dateString.optional(),
  })
  .strict();

export type ListLogsQuery = z.infer<typeof listLogsQuerySchema>;
export type CorrectLogInput = z.infer<typeof correctLogSchema>;
export type CompleteLogInput = z.infer<typeof completeLogSchema>;
export type ReclassifyLogInput = z.infer<typeof reclassifyLogSchema>;
