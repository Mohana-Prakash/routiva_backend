import { DateTime } from 'luxon';
import { crossesMidnight, dayOfWeek, localTimeToUtc } from '../../common/utils/time';
import type { RenderedOccurrence, ScheduleEntryForRender, ScheduleExceptionForRender } from './schedules.types';

function dbDateToString(d: Date): string {
  return DateTime.fromJSDate(d, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}

export function entryAppliesToDate(entry: ScheduleEntryForRender, date: string): boolean {
  if (!entry.isActive || !entry.activity.isActive) return false;

  const from = dbDateToString(entry.effectiveFrom);
  if (date < from) return false;
  if (entry.effectiveUntil && date > dbDateToString(entry.effectiveUntil)) return false;

  switch (entry.recurrenceType) {
    case 'DAILY':
      return true;
    case 'WEEKDAYS':
      return entry.daysOfWeek.includes(dayOfWeek(date));
    case 'ONE_TIME':
      return entry.oneTimeDate !== null && dbDateToString(entry.oneTimeDate) === date;
    default:
      return false;
  }
}

function buildOccurrenceKeyForEntry(entryId: string, date: string): string {
  return `se:${entryId}:${date}`;
}

function buildOccurrenceKeyForException(exceptionId: string, date: string): string {
  return `ex:${exceptionId}:${date}`;
}

function toRenderedFromEntry(
  entry: ScheduleEntryForRender,
  date: string,
  timezone: string,
  overrides?: {
    startTime?: string | null;
    endTime?: string | null;
    timelessReminderTime?: string | null;
    activityOverride?: ScheduleExceptionForRender['activity'];
    exceptionId?: string;
    action?: 'MOVE' | 'REPLACE';
  },
): RenderedOccurrence {
  // An exception always carries a fully-formed startTime/endTime pair (both set, or both null
  // for an intentional switch to timeless) — see schedules.validation.ts — so when one is
  // present it's used as-is, never merged with the base entry's own time.
  const startTime = overrides ? overrides.startTime ?? null : entry.startTime;
  const endTime = overrides ? overrides.endTime ?? null : entry.endTime;
  const timelessReminderTime = overrides ? overrides.timelessReminderTime ?? null : entry.timelessReminderTime;
  const activity = overrides?.activityOverride ?? entry.activity;
  const timing = resolveTiming(date, startTime, endTime, timezone);

  return {
    occurrenceKey: buildOccurrenceKeyForEntry(entry.id, date),
    date,
    activityId: activity.id,
    activityName: activity.name,
    categoryId: activity.categoryId,
    categoryName: activity.category?.name ?? null,
    categoryColor: activity.category?.color ?? null,
    categoryIcon: activity.category?.icon ?? null,
    ...timing,
    reminderAtUtc: timing.startTime ? null : resolveReminderAtUtc(date, timelessReminderTime, timezone),
    source: entry.recurrenceType === 'ONE_TIME' ? 'ONE_TIME' : 'RECURRING',
    scheduleEntryId: entry.id,
    exceptionId: overrides?.exceptionId ?? null,
    exceptionAction: overrides?.action ?? null,
    alarmEnabled: entry.alarmEnabled ?? activity.alarmEnabled,
    alarmOffsetMinutes: entry.alarmOffsetMinutes ?? activity.alarmOffsetMinutes,
  };
}

/** Computes the timed fields shared by both renderers, or the timeless equivalents (all null) when either time is absent. */
function resolveTiming(
  date: string,
  startTime: string | null,
  endTime: string | null,
  timezone: string,
): Pick<RenderedOccurrence, 'startTime' | 'endTime' | 'plannedStartUtc' | 'plannedEndUtc' | 'crossesMidnight'> {
  if (!startTime || !endTime) {
    return { startTime: null, endTime: null, plannedStartUtc: null, plannedEndUtc: null, crossesMidnight: false };
  }
  const wraps = crossesMidnight(startTime, endTime);
  const endDate = wraps ? DateTime.fromISO(date).plus({ days: 1 }).toFormat('yyyy-MM-dd') : date;
  return {
    startTime,
    endTime,
    plannedStartUtc: localTimeToUtc(date, startTime, timezone),
    plannedEndUtc: localTimeToUtc(endDate, endTime, timezone),
    crossesMidnight: wraps,
  };
}

/** The instant a timeless occurrence's "remind me at HH:mm" resolves to on the given date, if set. */
function resolveReminderAtUtc(date: string, timelessReminderTime: string | null, timezone: string): Date | null {
  if (!timelessReminderTime) return null;
  return localTimeToUtc(date, timelessReminderTime, timezone);
}

function toRenderedFromStandaloneException(exception: ScheduleExceptionForRender, timezone: string): RenderedOccurrence {
  const date = dbDateToString(exception.date);
  const timing = resolveTiming(date, exception.startTime, exception.endTime, timezone);

  return {
    occurrenceKey: buildOccurrenceKeyForException(exception.id, date),
    date,
    activityId: exception.activity.id,
    activityName: exception.activity.name,
    categoryId: exception.activity.categoryId,
    categoryName: exception.activity.category?.name ?? null,
    categoryColor: exception.activity.category?.color ?? null,
    categoryIcon: exception.activity.category?.icon ?? null,
    ...timing,
    reminderAtUtc: timing.startTime ? null : resolveReminderAtUtc(date, exception.timelessReminderTime, timezone),
    source: 'EXCEPTION',
    scheduleEntryId: null,
    exceptionId: exception.id,
    exceptionAction: exception.action,
    alarmEnabled: exception.activity.alarmEnabled,
    alarmOffsetMinutes: exception.activity.alarmOffsetMinutes,
  };
}

/**
 * Merges the base recurring schedule with date-specific exceptions into a deterministic,
 * chronologically sorted timeline for a single date. Pure function: no database access,
 * no side effects. `entries`/`exceptions` must already be scoped to the user.
 */
export function renderEffectiveSchedule(
  date: string,
  timezone: string,
  entries: ScheduleEntryForRender[],
  exceptions: ScheduleExceptionForRender[],
): RenderedOccurrence[] {
  const applicableEntries = entries.filter((e) => entryAppliesToDate(e, date));
  const exceptionsBySource = new Map<string, ScheduleExceptionForRender>();
  const standaloneExceptions: ScheduleExceptionForRender[] = [];

  for (const exception of exceptions) {
    if (dbDateToString(exception.date) !== date) continue;
    if (exception.sourceScheduleEntryId) {
      exceptionsBySource.set(exception.sourceScheduleEntryId, exception);
    } else {
      standaloneExceptions.push(exception);
    }
  }

  const occurrences: RenderedOccurrence[] = [];

  for (const entry of applicableEntries) {
    const exception = exceptionsBySource.get(entry.id);
    if (!exception) {
      occurrences.push(toRenderedFromEntry(entry, date, timezone));
      continue;
    }

    if (exception.action === 'SKIP') {
      continue;
    }
    if (exception.action === 'MOVE') {
      // A MOVE exception always carries its own fully-formed startTime/endTime pair — either
      // both set (moved to a new time) or both null (moved to timeless) — never merged with
      // the base entry's own time (see the both-or-neither refine in schedules.validation.ts).
      occurrences.push(
        toRenderedFromEntry(entry, date, timezone, {
          startTime: exception.startTime,
          endTime: exception.endTime,
          timelessReminderTime: exception.timelessReminderTime,
          exceptionId: exception.id,
          action: 'MOVE',
        }),
      );
      continue;
    }
    if (exception.action === 'REPLACE') {
      occurrences.push(
        toRenderedFromEntry(entry, date, timezone, {
          startTime: exception.startTime,
          endTime: exception.endTime,
          timelessReminderTime: exception.timelessReminderTime,
          activityOverride: exception.activity,
          exceptionId: exception.id,
          action: 'REPLACE',
        }),
      );
      continue;
    }
    // ADD with a source is treated the same as a standalone addition tied to that entry's slot —
    // explicitly reuses the entry's own time rather than relying on a fallback, since `overrides`
    // being present at all now means "use these values, even if null for timeless".
    occurrences.push(
      toRenderedFromEntry(entry, date, timezone, {
        startTime: entry.startTime,
        endTime: entry.endTime,
        timelessReminderTime: entry.timelessReminderTime,
        exceptionId: exception.id,
        action: 'MOVE',
      }),
    );
  }

  for (const exception of standaloneExceptions) {
    if (exception.action === 'SKIP') continue;
    occurrences.push(toRenderedFromStandaloneException(exception, timezone));
  }

  // Timed occurrences sort chronologically; timeless ones (no plannedStartUtc) sort after all
  // timed ones, then alphabetically by activity name for a stable order among themselves.
  occurrences.sort((a, b) => {
    if (a.plannedStartUtc && b.plannedStartUtc) return a.plannedStartUtc.getTime() - b.plannedStartUtc.getTime();
    if (a.plannedStartUtc) return -1;
    if (b.plannedStartUtc) return 1;
    return a.activityName.localeCompare(b.activityName);
  });
  return occurrences;
}
