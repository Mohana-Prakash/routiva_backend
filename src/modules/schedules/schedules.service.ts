import { DateTime } from 'luxon';
import { AppError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';
import { schedulesRepository } from './schedules.repository';
import { activitiesRepository } from '../activities/activities.repository';
import { trackingRepository } from '../tracking/tracking.repository';
import { renderEffectiveSchedule } from './schedule-renderer';
import { findConflictingEntries } from './schedule-conflict';
import { ensureLogsForOccurrences } from '../tracking/log-materializer';
import { cancelRemindersForActivityLogs, scheduleOrUpdateReminder } from '../notifications/notification-scheduler';
import { crossesMidnight, localTimeToUtc, todayInTimezone } from '../../common/utils/time';
import type {
  CreateExceptionInput,
  CreateScheduleEntryInput,
  UpdateExceptionInput,
  UpdateScheduleEntryInput,
} from './schedules.validation';
import type { ScheduleEntryForRender, ScheduleExceptionForRender } from './schedules.types';

function dateStringToDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function dbDateToDateString(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}

/**
 * Merges a possibly-omitted time field with the existing value for a partial update —
 * `next` present = new value, omitted = keep existing — except when `timeless` is true, which
 * always wins and clears to null regardless of what `next` was.
 */
function resolveTimeField(next: string | undefined, existing: string | null, timeless: boolean): string | null {
  if (timeless) return null;
  return next ?? existing;
}

/**
 * Once an occurrence has been started, completed, or skipped, its planned start/end time is
 * historical — changing it after the fact would retroactively contradict the tracking data
 * already recorded against it. A log that doesn't exist yet, or is still PLANNED, is fair game.
 */
async function assertOccurrenceStillPlanned(userId: string, occurrenceKey: string): Promise<void> {
  const log = await trackingRepository.findByOccurrenceKey(userId, occurrenceKey);
  if (log && log.status !== 'PLANNED') {
    throw AppError.invalidState(
      'Cannot change the time for this date — it has already started, been completed, or been skipped',
    );
  }
}

function assertNotPast(date: string, timezone: string, message: string): void {
  if (date < todayInTimezone(timezone)) {
    throw AppError.validation(message);
  }
}

/**
 * For a date-specific (exception) time, `assertNotPast` alone only rejects past *dates* — a
 * time earlier than right now on today's date passes it. This catches that case too. No-op for
 * a timeless slot (nothing to compare) or a date that's already in the future.
 */
function assertNotPastTime(date: string, time: string | null | undefined, timezone: string, message: string): void {
  if (!time) return;
  if (localTimeToUtc(date, time, timezone).getTime() < Date.now()) {
    throw AppError.validation(message);
  }
}

async function assertActivityOwnership(activityId: string, userId: string) {
  const activity = await activitiesRepository.findByIdForUser(activityId, userId);
  if (!activity) throw AppError.validation('activityId does not reference an activity you own');
  if (!activity.isActive) throw AppError.validation('Cannot schedule an archived activity');
  return activity;
}

async function pruneFutureLogsForEntry(entryId: string, fromDate: Date): Promise<void> {
  const logIds = await trackingRepository.findFuturePlannedLogIdsForEntry(entryId, fromDate);
  await cancelRemindersForActivityLogs(logIds);
  await trackingRepository.deleteFuturePlannedLogsForEntry(entryId, fromDate);
}

async function fetchEntriesAndExceptions(userId: string, date: string) {
  const [entries, exceptions] = await Promise.all([
    schedulesRepository.listEntriesForUser(userId, false),
    schedulesRepository.listExceptionsForDate(userId, dateStringToDbDate(date)),
  ]);
  return {
    entries: entries as unknown as ScheduleEntryForRender[],
    exceptions: exceptions as unknown as ScheduleExceptionForRender[],
  };
}

export const schedulesService = {
  async listEntries(userId: string, includeInactive: boolean) {
    return schedulesRepository.listEntriesForUser(userId, includeInactive);
  },

  async getEntryOwned(id: string, userId: string) {
    const entry = await schedulesRepository.findEntryForUser(id, userId);
    if (!entry) throw AppError.notFound('Schedule entry not found');
    return entry;
  },

  async renderDate(userId: string, date: string, timezone: string) {
    const { entries, exceptions } = await fetchEntriesAndExceptions(userId, date);
    return renderEffectiveSchedule(date, timezone, entries, exceptions);
  },

  /** Renders the date AND materializes PLANNED activity_logs for each occurrence (bounded to one date). */
  async renderAndMaterializeDate(userId: string, date: string, timezone: string) {
    const occurrences = await schedulesService.renderDate(userId, date, timezone);
    const materialized = await ensureLogsForOccurrences(userId, dateStringToDbDate(date), occurrences);

    await Promise.all(
      materialized
        .filter(({ log }) => log.status === 'PLANNED')
        .map(({ occurrence, log }) =>
          scheduleOrUpdateReminder(userId, timezone, occurrence, log.id).catch((err) => {
            // Reminder scheduling must never break schedule rendering for the user.
            logger.error({ err, userId, occurrenceKey: occurrence.occurrenceKey }, 'Failed to schedule reminder');
          }),
        ),
    );

    return materialized;
  },

  async createEntry(userId: string, timezone: string, input: CreateScheduleEntryInput) {
    await assertActivityOwnership(input.activityId, userId);

    const from = input.effectiveFrom ?? todayInTimezone(timezone);

    const candidate: ScheduleEntryForRender = {
      id: 'candidate',
      activityId: input.activityId,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      recurrenceType: input.recurrenceType,
      daysOfWeek: input.daysOfWeek ?? [],
      oneTimeDate: input.oneTimeDate ? dateStringToDbDate(input.oneTimeDate) : null,
      effectiveFrom: dateStringToDbDate(from),
      effectiveUntil: null,
      isActive: true,
      alarmEnabled: input.alarmEnabled ?? null,
      alarmOffsetMinutes: input.alarmOffsetMinutes ?? null,
      timelessReminderTime: input.timelessReminderTime ?? null,
      activity: {
        id: input.activityId,
        name: '',
        categoryId: null,
        category: null,
        alarmEnabled: false,
        alarmOffsetMinutes: 5,
        isActive: true,
      },
    };

    if (!input.override) {
      const existing = (await schedulesRepository.listEntriesForUser(userId, false)) as unknown as ScheduleEntryForRender[];
      const conflicts = findConflictingEntries(candidate, existing);
      if (conflicts.length > 0) {
        throw AppError.scheduleConflict('This schedule overlaps with existing entries', {
          conflicts: conflicts.map((c) => ({ id: c.id, activityId: c.activityId, activityName: c.activity.name, startTime: c.startTime, endTime: c.endTime })),
        });
      }
    }

    return schedulesRepository.createEntry(userId, {
      activityId: input.activityId,
      startTime: input.startTime,
      endTime: input.endTime,
      timelessReminderTime: input.timelessReminderTime ?? null,
      recurrenceType: input.recurrenceType,
      daysOfWeek: input.daysOfWeek ?? [],
      oneTimeDate: input.oneTimeDate ? dateStringToDbDate(input.oneTimeDate) : null,
      effectiveFrom: dateStringToDbDate(from),
      alarmEnabled: input.alarmEnabled ?? null,
      alarmOffsetMinutes: input.alarmOffsetMinutes ?? null,
    });
  },

  async updateEntry(id: string, userId: string, timezone: string, rawInput: UpdateScheduleEntryInput) {
    const existing = await schedulesService.getEntryOwned(id, userId);

    // "This occurrence" / "this and future" edits default to today when no explicit
    // effective date is supplied — the frontend does not currently collect one.
    const input = {
      ...rawInput,
      date: rawInput.date ?? ((rawInput.scope === 'ONLY' || rawInput.scope === 'FUTURE') ? todayInTimezone(timezone) : rawInput.date),
    };
    const timelessOverride = input.timeless === true;

    if (input.activityId) {
      await assertActivityOwnership(input.activityId, userId);
    }

    if (input.scope === 'ONLY' || input.scope === 'FUTURE') {
      assertNotPast(input.date as string, timezone, 'Cannot modify a schedule for a past date');
    }

    if (!input.override && input.scope === 'ALL') {
      const mergedForConflict: ScheduleEntryForRender = {
        ...(existing as unknown as ScheduleEntryForRender),
        startTime: resolveTimeField(input.startTime, existing.startTime, timelessOverride),
        endTime: resolveTimeField(input.endTime, existing.endTime, timelessOverride),
        recurrenceType: input.recurrenceType ?? existing.recurrenceType,
        daysOfWeek: input.daysOfWeek ?? existing.daysOfWeek,
        oneTimeDate: input.oneTimeDate ? dateStringToDbDate(input.oneTimeDate) : existing.oneTimeDate,
      };
      const others = ((await schedulesRepository.listEntriesForUser(userId, false)) as unknown as ScheduleEntryForRender[]).filter(
        (e) => e.id !== id,
      );
      const conflicts = findConflictingEntries(mergedForConflict, others);
      if (conflicts.length > 0) {
        throw AppError.scheduleConflict('This schedule overlaps with existing entries', {
          conflicts: conflicts.map((c) => ({ id: c.id, activityId: c.activityId, activityName: c.activity.name, startTime: c.startTime, endTime: c.endTime })),
        });
      }
    }

    if (input.scope === 'ONLY') {
      const date = input.date as string;
      const dbDate = dateStringToDbDate(date);
      const existingException = await schedulesRepository.findExceptionBySourceAndDate(userId, id, dbDate);
      const payload = {
        activityId: input.activityId ?? existing.activityId,
        date: dbDate,
        startTime: resolveTimeField(input.startTime, existing.startTime, timelessOverride),
        endTime: resolveTimeField(input.endTime, existing.endTime, timelessOverride),
        timelessReminderTime:
          input.timelessReminderTime !== undefined ? input.timelessReminderTime : existing.timelessReminderTime,
        action: 'REPLACE' as const,
        reason: 'Occurrence-only edit',
      };
      if (existingException) {
        await schedulesRepository.updateException(existingException.id, payload);
      } else {
        await schedulesRepository.createException(userId, {
          ...payload,
          sourceScheduleEntryId: id,
        });
      }
      await pruneFutureLogsForEntry(id, dbDate);
      return schedulesService.getEntryOwned(id, userId);
    }

    if (input.scope === 'FUTURE') {
      const date = input.date as string;
      const dayBefore = DateTime.fromISO(date).minus({ days: 1 }).toFormat('yyyy-MM-dd');
      await schedulesRepository.updateEntry(id, { effectiveUntil: dateStringToDbDate(dayBefore) });
      const created = await schedulesRepository.createEntry(userId, {
        activityId: input.activityId ?? existing.activityId,
        startTime: resolveTimeField(input.startTime, existing.startTime, timelessOverride),
        endTime: resolveTimeField(input.endTime, existing.endTime, timelessOverride),
        timelessReminderTime:
          input.timelessReminderTime !== undefined ? input.timelessReminderTime : existing.timelessReminderTime,
        recurrenceType: input.recurrenceType ?? existing.recurrenceType,
        daysOfWeek: input.daysOfWeek ?? existing.daysOfWeek,
        oneTimeDate: input.oneTimeDate ? dateStringToDbDate(input.oneTimeDate) : null,
        effectiveFrom: dateStringToDbDate(date),
        alarmEnabled: input.alarmEnabled !== undefined ? input.alarmEnabled : existing.alarmEnabled,
        alarmOffsetMinutes: input.alarmOffsetMinutes !== undefined ? input.alarmOffsetMinutes : existing.alarmOffsetMinutes,
      });
      await pruneFutureLogsForEntry(id, dateStringToDbDate(date));
      return created;
    }

    // scope === 'ALL'
    const updated = await schedulesRepository.updateEntry(id, {
      activityId: input.activityId,
      startTime: timelessOverride ? null : input.startTime,
      endTime: timelessOverride ? null : input.endTime,
      timelessReminderTime: input.timelessReminderTime,
      recurrenceType: input.recurrenceType,
      daysOfWeek: input.daysOfWeek,
      oneTimeDate: input.oneTimeDate ? dateStringToDbDate(input.oneTimeDate) : undefined,
      alarmEnabled: input.alarmEnabled,
      alarmOffsetMinutes: input.alarmOffsetMinutes,
      isActive: input.isActive,
    });
    await pruneFutureLogsForEntry(id, dateStringToDbDate(todayInTimezone(timezone)));
    return updated;
  },

  async archiveEntry(id: string, userId: string, timezone: string) {
    await schedulesService.getEntryOwned(id, userId);
    const updated = await schedulesRepository.deactivateEntry(id);
    await pruneFutureLogsForEntry(id, dateStringToDbDate(todayInTimezone(timezone)));
    return updated;
  },

  async listExceptionsForRange(userId: string, from: string, to: string) {
    return schedulesRepository.listExceptionsForRange(userId, dateStringToDbDate(from), dateStringToDbDate(to));
  },

  async createException(userId: string, timezone: string, input: CreateExceptionInput) {
    await assertActivityOwnership(input.activityId, userId);
    assertNotPast(input.date, timezone, 'Cannot create a schedule exception for a past date');
    if (input.action !== 'SKIP') {
      assertNotPastTime(input.date, input.startTime, timezone, 'Start time has already passed today');
    }

    if (input.sourceScheduleEntryId) {
      const source = await schedulesRepository.findEntryForUser(input.sourceScheduleEntryId, userId);
      if (!source) throw AppError.validation('sourceScheduleEntryId does not reference a schedule entry you own');

      const dbDate = dateStringToDbDate(input.date);
      const duplicate = await schedulesRepository.findExceptionBySourceAndDate(userId, input.sourceScheduleEntryId, dbDate);
      if (duplicate) {
        throw AppError.duplicate('An exception already exists for this schedule entry on this date');
      }

      if (input.action === 'MOVE') {
        await assertOccurrenceStillPlanned(userId, `se:${input.sourceScheduleEntryId}:${input.date}`);
      }
    }

    // A timeless exception (no fixed slot) can never conflict with anything, so conflict
    // checking only applies when this exception actually has a time.
    if (input.action !== 'SKIP' && !input.override && input.startTime && input.endTime) {
      const occurrences = await schedulesService.renderDate(userId, input.date, timezone);
      const logsForDate = await trackingRepository.listForDate(userId, dateStringToDbDate(input.date));
      const resolvedKeys = new Set(
        logsForDate.filter((log) => log.status !== 'PLANNED' && log.status !== 'IN_PROGRESS').map((log) => log.occurrenceKey),
      );
      // An occurrence whose outcome is already settled (completed/skipped/etc.) isn't really
      // occupying its planned slot anymore, so it shouldn't block a new activity from using it.
      const remaining = occurrences.filter(
        (o) => o.scheduleEntryId !== input.sourceScheduleEntryId && !resolvedKeys.has(o.occurrenceKey),
      );

      const wraps = crossesMidnight(input.startTime, input.endTime);
      const endDate = wraps ? DateTime.fromISO(input.date).plus({ days: 1 }).toFormat('yyyy-MM-dd') : input.date;
      const candidateStartUtc = localTimeToUtc(input.date, input.startTime, timezone);
      const candidateEndUtc = localTimeToUtc(endDate, input.endTime, timezone);

      const conflicts = remaining.filter(
        (o) =>
          o.plannedStartUtc &&
          o.plannedEndUtc &&
          candidateStartUtc.getTime() < o.plannedEndUtc.getTime() &&
          o.plannedStartUtc.getTime() < candidateEndUtc.getTime(),
      );
      if (conflicts.length > 0) {
        throw AppError.scheduleConflict('This exception overlaps with the effective schedule for that date', {
          conflicts: conflicts.map((c) => ({ id: c.occurrenceKey, activityId: c.activityId, activityName: c.activityName, startTime: c.startTime, endTime: c.endTime })),
        });
      }
    }

    const created = await schedulesRepository.createException(userId, {
      activityId: input.activityId,
      date: dateStringToDbDate(input.date),
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      timelessReminderTime: input.timelessReminderTime ?? null,
      action: input.action,
      reason: input.reason ?? null,
      ...(input.sourceScheduleEntryId ? { sourceScheduleEntryId: input.sourceScheduleEntryId } : {}),
    });

    if (input.action === 'SKIP' && input.sourceScheduleEntryId) {
      const key = `se:${input.sourceScheduleEntryId}:${input.date}`;
      const existingLog = await trackingRepository.findByOccurrenceKey(userId, key);
      if (existingLog) {
        if (existingLog.status === 'PLANNED') {
          await trackingRepository.transitionStatus(existingLog.id, userId, ['PLANNED'], { status: 'SKIPPED' });
        }
        // Regardless of the log's prior status, this date is now explicitly skipped — any
        // reminder still queued for it (e.g. the end-of-window "did you do this?" check) would
        // otherwise still fire and reference an activity the user just said isn't happening.
        await cancelRemindersForActivityLogs([existingLog.id]);
      }
    }

    return created;
  },

  async getExceptionOwned(id: string, userId: string) {
    const exception = await schedulesRepository.findExceptionForUser(id, userId);
    if (!exception) throw AppError.notFound('Schedule exception not found');
    return exception;
  },

  async updateException(id: string, userId: string, timezone: string, input: UpdateExceptionInput) {
    const existing = await schedulesService.getExceptionOwned(id, userId);
    assertNotPast(dbDateToDateString(existing.date), timezone, 'Cannot modify a past schedule exception');

    if (input.startTime !== undefined || input.endTime !== undefined) {
      await assertOccurrenceStillPlanned(userId, `ex:${id}:${dbDateToDateString(existing.date)}`);
    }
    if (input.startTime !== undefined) {
      assertNotPastTime(dbDateToDateString(existing.date), input.startTime, timezone, 'Start time has already passed today');
    }

    return schedulesRepository.updateException(id, {
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
      timelessReminderTime:
        input.timelessReminderTime !== undefined ? input.timelessReminderTime : existing.timelessReminderTime,
      reason: input.reason !== undefined ? input.reason : existing.reason,
    });
  },

  async deleteException(id: string, userId: string, timezone: string) {
    const existing = await schedulesService.getExceptionOwned(id, userId);
    assertNotPast(dbDateToDateString(existing.date), timezone, 'Cannot delete a past schedule exception');

    // Removing this date's exception means the activity it represented no longer happens
    // (either it reverts to the base schedule, or — for a standalone ADD — disappears
    // entirely) — either way, any reminder still queued for it should go with it.
    const key = `ex:${id}:${dbDateToDateString(existing.date)}`;
    const existingLog = await trackingRepository.findByOccurrenceKey(userId, key);
    if (existingLog) {
      await cancelRemindersForActivityLogs([existingLog.id]);
    }

    await schedulesRepository.deleteException(id);
  },
};
