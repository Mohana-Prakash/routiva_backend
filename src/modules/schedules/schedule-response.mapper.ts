import { DateTime } from 'luxon';
import { ActivityLog, ScheduleEntry, ScheduleException } from '@prisma/client';
import { computeSameDayConflicts } from './day-conflicts';
import { toActivityLogDto } from '../tracking/tracking.mapper';
import type { RenderedOccurrence } from './schedules.types';

const DEFAULT_CATEGORY_COLOR = '#64748b'; // neutral slate — used when a category has no color set

function dbDateToString(d: Date): string {
  return DateTime.fromJSDate(d, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}

function mapSource(source: RenderedOccurrence['source']): 'BASE' | 'EXCEPTION' | 'ONE_TIME' {
  if (source === 'RECURRING') return 'BASE';
  return source;
}

/**
 * Builds the frontend's expected `DayScheduleResponse` shape from the internal render
 * output. This is purely a response-formatting concern (nested activityLog, category
 * styling defaults, same-day conflict flags) — the internal RenderedOccurrence/ActivityLog
 * domain types stay as they are; only the HTTP boundary is enriched here.
 */
export function toDayScheduleResponse(
  date: string,
  timezone: string,
  materialized: Array<{ occurrence: RenderedOccurrence; log: ActivityLog }>,
) {
  const conflictsByKey = computeSameDayConflicts(materialized.map((m) => m.occurrence));

  const items = materialized.map(({ occurrence, log }) => {
    const conflictKeys = conflictsByKey.get(occurrence.occurrenceKey) ?? [];
    return {
      id: log.id,
      date: occurrence.date,
      activityId: occurrence.activityId,
      activityName: occurrence.activityName,
      categoryId: occurrence.categoryId,
      categoryName: occurrence.categoryName ?? 'Uncategorized',
      categoryColor: occurrence.categoryColor ?? DEFAULT_CATEGORY_COLOR,
      categoryIcon: occurrence.categoryIcon,
      startTime: occurrence.startTime,
      endTime: occurrence.endTime,
      source: mapSource(occurrence.source),
      scheduleEntryId: occurrence.scheduleEntryId,
      exceptionId: occurrence.exceptionId,
      alarmEnabled: occurrence.alarmEnabled,
      alarmOffsetMinutes: occurrence.alarmOffsetMinutes,
      notes: log.notes,
      activityLog: toActivityLogDto(log),
      hasConflict: conflictKeys.length > 0,
      conflictsWithIds: conflictKeys
        .map((key) => materialized.find((m) => m.occurrence.occurrenceKey === key)?.log.id)
        .filter((id): id is string => Boolean(id)),
    };
  });

  return { date, timezone, items };
}

/** Maps the internal flat schedule-entry fields to the frontend's nested `recurrence` shape. */
export function toScheduleEntryDto(entry: ScheduleEntry) {
  return {
    id: entry.id,
    userId: entry.userId,
    activityId: entry.activityId,
    startTime: entry.startTime,
    endTime: entry.endTime,
    recurrence: {
      type: entry.recurrenceType,
      daysOfWeek: entry.recurrenceType === 'WEEKDAYS' ? entry.daysOfWeek : undefined,
      date: entry.recurrenceType === 'ONE_TIME' && entry.oneTimeDate ? dbDateToString(entry.oneTimeDate) : undefined,
    },
    isActive: entry.isActive,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function toScheduleExceptionDto(exception: ScheduleException) {
  return {
    id: exception.id,
    userId: exception.userId,
    sourceScheduleEntryId: exception.sourceScheduleEntryId,
    activityId: exception.activityId,
    date: dbDateToString(exception.date),
    startTime: exception.startTime,
    endTime: exception.endTime,
    action: exception.action,
    reason: exception.reason,
    createdAt: exception.createdAt.toISOString(),
    updatedAt: exception.updatedAt.toISOString(),
  };
}
