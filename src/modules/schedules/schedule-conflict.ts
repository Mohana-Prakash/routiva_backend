import { DateTime } from 'luxon';
import { timeRangesOverlap } from '../../common/utils/interval';
import { entryAppliesToDate } from './schedule-renderer';
import type { ScheduleEntryForRender } from './schedules.types';

function dbDateToString(d: Date): string {
  return DateTime.fromJSDate(d, { zone: 'utc' }).toFormat('yyyy-MM-dd');
}

function daysCoveredByEntry(entry: ScheduleEntryForRender): Set<number> {
  if (entry.recurrenceType === 'DAILY') return new Set([0, 1, 2, 3, 4, 5, 6]);
  if (entry.recurrenceType === 'WEEKDAYS') return new Set(entry.daysOfWeek);
  return new Set(); // ONE_TIME handled separately
}

function recurringRangesOverlap(a: ScheduleEntryForRender, b: ScheduleEntryForRender): boolean {
  const aFrom = dbDateToString(a.effectiveFrom);
  const aUntil = a.effectiveUntil ? dbDateToString(a.effectiveUntil) : null;
  const bFrom = dbDateToString(b.effectiveFrom);
  const bUntil = b.effectiveUntil ? dbDateToString(b.effectiveUntil) : null;

  const startsBeforeOtherEnds = !bUntil || aFrom <= bUntil;
  const endsAfterOtherStarts = !aUntil || bFrom <= aUntil;
  if (!startsBeforeOtherEnds || !endsAfterOtherStarts) return false;

  const aDays = daysCoveredByEntry(a);
  const bDays = daysCoveredByEntry(b);
  for (const day of aDays) {
    if (bDays.has(day)) return true;
  }
  return false;
}

/** True when two schedule entries could ever apply to the same calendar date. */
function patternsCanCoincide(a: ScheduleEntryForRender, b: ScheduleEntryForRender): boolean {
  if (a.recurrenceType === 'ONE_TIME' && b.recurrenceType === 'ONE_TIME') {
    return a.oneTimeDate !== null && b.oneTimeDate !== null && dbDateToString(a.oneTimeDate) === dbDateToString(b.oneTimeDate);
  }
  if (a.recurrenceType === 'ONE_TIME') {
    return a.oneTimeDate !== null && entryAppliesToDate(b, dbDateToString(a.oneTimeDate));
  }
  if (b.recurrenceType === 'ONE_TIME') {
    return b.oneTimeDate !== null && entryAppliesToDate(a, dbDateToString(b.oneTimeDate));
  }
  return recurringRangesOverlap(a, b);
}

/**
 * Returns the subset of `existingEntries` that would create a scheduling conflict with
 * `candidate` — i.e. their recurrence patterns can land on the same calendar date and their
 * local time windows overlap (midnight-crossing aware).
 */
export function findConflictingEntries(
  candidate: ScheduleEntryForRender,
  existingEntries: ScheduleEntryForRender[],
): ScheduleEntryForRender[] {
  // Timeless entries (no fixed slot) can never time-conflict with anything.
  if (!candidate.startTime || !candidate.endTime) return [];

  return existingEntries.filter((existing) => {
    if (existing.id === candidate.id) return false;
    if (!existing.isActive) return false;
    if (!existing.startTime || !existing.endTime) return false;
    if (!patternsCanCoincide(candidate, existing)) return false;
    return timeRangesOverlap(candidate.startTime as string, candidate.endTime as string, existing.startTime, existing.endTime);
  });
}
