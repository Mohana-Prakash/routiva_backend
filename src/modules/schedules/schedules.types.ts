import { ExceptionAction, RecurrenceType } from '@prisma/client';

export interface RenderedOccurrence {
  occurrenceKey: string;
  date: string;
  activityId: string;
  activityName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  startTime: string;
  endTime: string;
  plannedStartUtc: Date;
  plannedEndUtc: Date;
  crossesMidnight: boolean;
  source: 'RECURRING' | 'ONE_TIME' | 'EXCEPTION';
  scheduleEntryId: string | null;
  exceptionId: string | null;
  exceptionAction: ExceptionAction | null;
  alarmEnabled: boolean;
  alarmOffsetMinutes: number;
}

interface ActivityForRender {
  id: string;
  name: string;
  categoryId: string | null;
  category: { id: string; name: string; color: string | null; icon: string | null } | null;
  alarmEnabled: boolean;
  alarmOffsetMinutes: number;
  isActive: boolean;
}

export interface ScheduleEntryForRender {
  id: string;
  activityId: string;
  startTime: string;
  endTime: string;
  recurrenceType: RecurrenceType;
  daysOfWeek: number[];
  oneTimeDate: Date | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  isActive: boolean;
  alarmEnabled: boolean | null;
  alarmOffsetMinutes: number | null;
  activity: ActivityForRender;
}

export interface ScheduleExceptionForRender {
  id: string;
  sourceScheduleEntryId: string | null;
  activityId: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  action: ExceptionAction;
  reason: string | null;
  activity: Omit<ActivityForRender, 'isActive'>;
}
