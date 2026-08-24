import { z } from 'zod';
import { isValidDateString, isValidTimeOfDay } from '../../common/utils/time';

const timeString = z.string().refine(isValidTimeOfDay, 'Must be HH:mm (24h)');
const dateString = z.string().refine(isValidDateString, 'Must be YYYY-MM-DD');

// Wire-shape enums as sent by the frontend (frontend-requirements / types/schedule.ts),
// mapped to the internal domain enums used throughout schedules.service.ts.
const updateScopeWire = z.enum(['THIS_OCCURRENCE', 'THIS_AND_FUTURE', 'ENTIRE_RULE']);
const SCOPE_WIRE_TO_DOMAIN = { THIS_OCCURRENCE: 'ONLY', THIS_AND_FUTURE: 'FUTURE', ENTIRE_RULE: 'ALL' } as const;

// The frontend's conflict-resolution dialog offers three "proceed anyway" choices; the
// backend does not yet differentiate their effects beyond "create/update despite the
// conflict" (see AppError.scheduleConflict / findConflictingEntries), so any of them maps
// to the same override behavior. This is a deliberate simplification, not a bug.
const conflictResolutionWire = z.enum(['KEEP_BOTH', 'SHIFT_AFFECTED', 'SKIP_AFFECTED_TODAY']).optional();

const recurrenceSchema = z
  .object({
    type: z.enum(['DAILY', 'WEEKDAYS', 'ONE_TIME']),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    date: dateString.optional(),
  })
  .strict()
  .refine((v) => v.type !== 'WEEKDAYS' || (v.daysOfWeek && v.daysOfWeek.length > 0), {
    message: 'daysOfWeek is required for WEEKDAYS recurrence',
    path: ['daysOfWeek'],
  })
  .refine((v) => v.type !== 'ONE_TIME' || !!v.date, {
    message: 'date is required for ONE_TIME recurrence',
    path: ['date'],
  });

export const createScheduleEntrySchema = z
  .object({
    activityId: z.string().uuid(),
    // Both present = timed; both null/omitted = timeless (no fixed slot, available all day).
    startTime: timeString.nullable().optional(),
    endTime: timeString.nullable().optional(),
    // Only meaningful when timeless (startTime/endTime omitted) — the absolute time of day to
    // send the reminder at, since there's no start time to offset a reminder from.
    timelessReminderTime: timeString.nullable().optional(),
    recurrence: recurrenceSchema,
    effectiveFrom: dateString.optional(),
    alarmEnabled: z.boolean().nullable().optional(),
    alarmOffsetMinutes: z.number().int().min(0).max(180).nullable().optional(),
    resolution: conflictResolutionWire,
    override: z.boolean().optional(),
  })
  .strict()
  .refine((v) => !!v.startTime === !!v.endTime, {
    message: 'startTime and endTime must both be set, or both omitted for a timeless entry',
    path: ['endTime'],
  })
  .refine((v) => !v.startTime || v.startTime !== v.endTime, { message: 'startTime and endTime must differ', path: ['endTime'] })
  .transform((v) => ({
    activityId: v.activityId,
    startTime: v.startTime,
    endTime: v.endTime,
    timelessReminderTime: v.timelessReminderTime,
    recurrenceType: v.recurrence.type,
    daysOfWeek: v.recurrence.daysOfWeek,
    oneTimeDate: v.recurrence.date,
    effectiveFrom: v.effectiveFrom,
    alarmEnabled: v.alarmEnabled,
    alarmOffsetMinutes: v.alarmOffsetMinutes,
    override: v.override ?? !!v.resolution,
  }));

export const updateScheduleEntrySchema = z
  .object({
    activityId: z.string().uuid().optional(),
    // Omitted = unchanged, standard partial-update semantics (either field can be changed
    // independently). `timeless: true` is the explicit, unambiguous signal to switch to no
    // fixed slot — it wins over any startTime/endTime also present in the same request.
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    timeless: z.boolean().optional(),
    // Omitted = unchanged; `null` explicitly clears it (e.g. switching back off).
    timelessReminderTime: timeString.nullable().optional(),
    recurrence: recurrenceSchema.optional(),
    alarmEnabled: z.boolean().nullable().optional(),
    alarmOffsetMinutes: z.number().int().min(0).max(180).nullable().optional(),
    isActive: z.boolean().optional(),
    scope: updateScopeWire.optional().default('THIS_AND_FUTURE'),
    // Wire field is `effectiveDate`; `date` is also accepted for direct API/curl use.
    effectiveDate: dateString.optional(),
    date: dateString.optional(),
    resolution: conflictResolutionWire,
    override: z.boolean().optional(),
  })
  .strict()
  .refine((v) => !v.startTime || !v.endTime || v.startTime !== v.endTime, { message: 'startTime and endTime must differ', path: ['endTime'] })
  .transform((v) => ({
    activityId: v.activityId,
    startTime: v.startTime,
    endTime: v.endTime,
    timeless: v.timeless,
    timelessReminderTime: v.timelessReminderTime,
    recurrenceType: v.recurrence?.type,
    daysOfWeek: v.recurrence?.daysOfWeek,
    oneTimeDate: v.recurrence?.date,
    alarmEnabled: v.alarmEnabled,
    alarmOffsetMinutes: v.alarmOffsetMinutes,
    isActive: v.isActive,
    scope: SCOPE_WIRE_TO_DOMAIN[v.scope],
    // "This and future" / "this occurrence" scoped edits with no explicit date default to
    // today (in the caller's timezone, applied in schedules.service.ts) — the frontend does
    // not currently collect an effective date from the user for these actions.
    date: v.effectiveDate ?? v.date,
    override: v.override ?? !!v.resolution,
  }));

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

export const deleteScheduleEntryQuerySchema = z
  .object({
    scope: updateScopeWire.optional(),
  })
  .strict();

export const createExceptionSchema = z
  .object({
    sourceScheduleEntryId: z.string().uuid().nullable().optional(),
    activityId: z.string().uuid(),
    date: dateString,
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    timelessReminderTime: timeString.nullable().optional(),
    action: z.enum(['MOVE', 'SKIP', 'ADD', 'REPLACE']),
    reason: z.string().trim().max(500).nullable().optional(),
    resolution: conflictResolutionWire,
    override: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.action === 'SKIP' || !!v.startTime === !!v.endTime, {
    message: 'startTime and endTime must both be set, or both omitted for a timeless entry, unless action is SKIP',
    path: ['startTime'],
  })
  .refine((v) => v.action !== 'ADD' || !v.sourceScheduleEntryId, {
    message: 'ADD exceptions must not reference a sourceScheduleEntryId',
    path: ['sourceScheduleEntryId'],
  })
  .transform((v) => ({ ...v, reason: v.reason ?? undefined, override: v.override ?? !!v.resolution }));

export const updateExceptionSchema = z
  .object({
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    timelessReminderTime: timeString.nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
    resolution: conflictResolutionWire,
    override: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided')
  .transform((v) => ({ ...v, override: v.override ?? !!v.resolution }));

export const exceptionIdParamSchema = z.object({ id: z.string().uuid() });

export type CreateScheduleEntryInput = z.infer<typeof createScheduleEntrySchema>;
export type UpdateScheduleEntryInput = z.infer<typeof updateScheduleEntrySchema>;
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>;
export type UpdateExceptionInput = z.infer<typeof updateExceptionSchema>;
