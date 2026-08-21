import { z } from 'zod';
import { isValidDateString, isValidTimeOfDay } from '../../common/utils/time';

const timeString = z.string().refine(isValidTimeOfDay, 'Must be HH:mm (24h)');
const dateString = z.string().refine(isValidDateString, 'Must be YYYY-MM-DD');

const baseScheduleFields = {
  activityId: z.string().uuid(),
  startTime: timeString,
  endTime: timeString,
  recurrenceType: z.enum(['DAILY', 'WEEKDAYS', 'ONE_TIME']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  oneTimeDate: dateString.optional(),
  effectiveFrom: dateString.optional(),
  alarmEnabled: z.boolean().nullable().optional(),
  alarmOffsetMinutes: z.number().int().min(0).max(180).nullable().optional(),
  override: z.boolean().optional().default(false),
};

export const createScheduleEntrySchema = z
  .object(baseScheduleFields)
  .strict()
  .refine((v) => v.startTime !== v.endTime, { message: 'startTime and endTime must differ', path: ['endTime'] })
  .refine((v) => v.recurrenceType !== 'WEEKDAYS' || (v.daysOfWeek && v.daysOfWeek.length > 0), {
    message: 'daysOfWeek is required for WEEKDAYS recurrence',
    path: ['daysOfWeek'],
  })
  .refine((v) => v.recurrenceType !== 'ONE_TIME' || !!v.oneTimeDate, {
    message: 'oneTimeDate is required for ONE_TIME recurrence',
    path: ['oneTimeDate'],
  });

export const updateScheduleEntrySchema = z
  .object({
    activityId: z.string().uuid().optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    recurrenceType: z.enum(['DAILY', 'WEEKDAYS', 'ONE_TIME']).optional(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    oneTimeDate: dateString.optional(),
    alarmEnabled: z.boolean().nullable().optional(),
    alarmOffsetMinutes: z.number().int().min(0).max(180).nullable().optional(),
    isActive: z.boolean().optional(),
    override: z.boolean().optional().default(false),
    scope: z.enum(['ONLY', 'FUTURE', 'ALL']).optional().default('ALL'),
    date: dateString.optional(),
  })
  .strict()
  .refine((v) => v.scope === 'ALL' || !!v.date, {
    message: 'date is required when scope is ONLY or FUTURE',
    path: ['date'],
  });

export const scheduleIdParamSchema = z.object({ id: z.string().uuid() });

export const dateParamSchema = z.object({ date: dateString });

export const listSchedulesQuerySchema = z
  .object({
    includeInactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  })
  .strict();

export const createExceptionSchema = z
  .object({
    sourceScheduleEntryId: z.string().uuid().nullable().optional(),
    activityId: z.string().uuid(),
    date: dateString,
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    action: z.enum(['MOVE', 'SKIP', 'ADD', 'REPLACE']),
    reason: z.string().trim().max(500).optional(),
    override: z.boolean().optional().default(false),
  })
  .strict()
  .refine((v) => v.action === 'SKIP' || (!!v.startTime && !!v.endTime), {
    message: 'startTime and endTime are required unless action is SKIP',
    path: ['startTime'],
  })
  .refine((v) => v.action !== 'ADD' || !v.sourceScheduleEntryId, {
    message: 'ADD exceptions must not reference a sourceScheduleEntryId',
    path: ['sourceScheduleEntryId'],
  });

export const updateExceptionSchema = z
  .object({
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    reason: z.string().trim().max(500).nullable().optional(),
    override: z.boolean().optional().default(false),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const exceptionIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateScheduleEntryInput = z.infer<typeof createScheduleEntrySchema>;
export type UpdateScheduleEntryInput = z.infer<typeof updateScheduleEntrySchema>;
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>;
export type UpdateExceptionInput = z.infer<typeof updateExceptionSchema>;
