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
  overrides?: { startTime?: string; endTime?: string; activityOverride?: ScheduleExceptionForRender['activity']; exceptionId?: string; action?: 'MOVE' | 'REPLACE' },
): RenderedOccurrence {
  const startTime = overrides?.startTime ?? entry.startTime;
  const endTime = overrides?.endTime ?? entry.endTime;
  const activity = overrides?.activityOverride ?? entry.activity;
  const wraps = crossesMidnight(startTime, endTime);
  const endDate = wraps ? DateTime.fromISO(date).plus({ days: 1 }).toFormat('yyyy-MM-dd') : date;

  return {
    occurrenceKey: buildOccurrenceKeyForEntry(entry.id, date),
    date,
    activityId: activity.id,
    activityName: activity.name,
    categoryId: activity.categoryId,
    categoryName: activity.category?.name ?? null,
    categoryColor: activity.category?.color ?? null,
    categoryIcon: activity.category?.icon ?? null,
    startTime,
    endTime,
    plannedStartUtc: localTimeToUtc(date, startTime, timezone),
    plannedEndUtc: localTimeToUtc(endDate, endTime, timezone),
    crossesMidnight: wraps,
    source: entry.recurrenceType === 'ONE_TIME' ? 'ONE_TIME' : 'RECURRING',
    scheduleEntryId: entry.id,
    exceptionId: overrides?.exceptionId ?? null,
    exceptionAction: overrides?.action ?? null,
    alarmEnabled: entry.alarmEnabled ?? activity.alarmEnabled,
    alarmOffsetMinutes: entry.alarmOffsetMinutes ?? activity.alarmOffsetMinutes,
  };
}

function toRenderedFromStandaloneException(exception: ScheduleExceptionForRender, timezone: string): RenderedOccurrence {
  const date = dbDateToString(exception.date);
  const startTime = exception.startTime as string;
  const endTime = exception.endTime as string;
  const wraps = crossesMidnight(startTime, endTime);
  const endDate = wraps ? DateTime.fromISO(date).plus({ days: 1 }).toFormat('yyyy-MM-dd') : date;

  return {
    occurrenceKey: buildOccurrenceKeyForException(exception.id, date),
    date,
    activityId: exception.activity.id,
    activityName: exception.activity.name,
    categoryId: exception.activity.categoryId,
    categoryName: exception.activity.category?.name ?? null,
    categoryColor: exception.activity.category?.color ?? null,
    categoryIcon: exception.activity.category?.icon ?? null,
    startTime,
    endTime,
    plannedStartUtc: localTimeToUtc(date, startTime, timezone),
    plannedEndUtc: localTimeToUtc(endDate, endTime, timezone),
    crossesMidnight: wraps,
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
      occurrences.push(
        toRenderedFromEntry(entry, date, timezone, {
          startTime: exception.startTime ?? entry.startTime,
          endTime: exception.endTime ?? entry.endTime,
          exceptionId: exception.id,
          action: 'MOVE',
        }),
      );
      continue;
    }
    if (exception.action === 'REPLACE') {
      occurrences.push(
        toRenderedFromEntry(entry, date, timezone, {
          startTime: exception.startTime ?? entry.startTime,
          endTime: exception.endTime ?? entry.endTime,
          activityOverride: exception.activity,
          exceptionId: exception.id,
          action: 'REPLACE',
        }),
      );
      continue;
    }
    // ADD with a source is treated the same as a standalone addition tied to that entry's slot.
    occurrences.push(toRenderedFromEntry(entry, date, timezone, { exceptionId: exception.id, action: 'MOVE' }));
  }

  for (const exception of standaloneExceptions) {
    if (exception.action === 'SKIP') continue;
    if (!exception.startTime || !exception.endTime) continue;
    occurrences.push(toRenderedFromStandaloneException(exception, timezone));
  }

  occurrences.sort((a, b) => a.plannedStartUtc.getTime() - b.plannedStartUtc.getTime());
  return occurrences;
}
