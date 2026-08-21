import { DateTime } from 'luxon';
import { ActivityLog } from '@prisma/client';

function dbDateToString(d: Date): string {
  return DateTime.fromJSDate(d, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}

/** Maps the internal ActivityLog row to the frontend's `ActivityLog` type (types/activity-log.ts). */
export function toActivityLogDto(log: ActivityLog) {
  return {
    id: log.id,
    userId: log.userId,
    activityId: log.activityId,
    scheduleEntryId: log.scheduleEntryId,
    exceptionId: log.exceptionId,
    activityDate: dbDateToString(log.activityDate),
    plannedStart: log.plannedStart ? log.plannedStart.toISOString() : null,
    plannedEnd: log.plannedEnd ? log.plannedEnd.toISOString() : null,
    actualStart: log.actualStart ? log.actualStart.toISOString() : null,
    actualEnd: log.actualEnd ? log.actualEnd.toISOString() : null,
    status: log.status,
    notes: log.notes,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
    completedAt: log.completedAt ? log.completedAt.toISOString() : null,
    activityNameSnapshot: log.activityNameSnapshot,
    categoryNameSnapshot: log.categoryNameSnapshot,
  };
}
