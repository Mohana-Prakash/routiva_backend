import { Prisma } from '@prisma/client';
import { trackingRepository } from './tracking.repository';
import type { RenderedOccurrence } from '../schedules/schedules.types';

/**
 * Ensures a PLANNED ActivityLog exists for every rendered occurrence, without ever mutating
 * an existing log. Safe to call repeatedly (idempotent via the unique occurrenceKey) and safe
 * under concurrent requests (unique-constraint races are resolved by re-reading the row).
 */
export async function ensureLogsForOccurrences(userId: string, activityDate: Date, occurrences: RenderedOccurrence[]) {
  const results = [];

  for (const occ of occurrences) {
    let log = await trackingRepository.findByOccurrenceKey(userId, occ.occurrenceKey);

    if (!log) {
      try {
        log = await trackingRepository.createPlanned({
          userId,
          activityId: occ.activityId,
          scheduleEntryId: occ.scheduleEntryId,
          exceptionId: occ.exceptionId,
          activityDate,
          plannedStart: occ.plannedStartUtc,
          plannedEnd: occ.plannedEndUtc,
          activityNameSnapshot: occ.activityName,
          categoryNameSnapshot: occ.categoryName,
          occurrenceKey: occ.occurrenceKey,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          log = await trackingRepository.findByOccurrenceKey(userId, occ.occurrenceKey);
        } else {
          throw err;
        }
      }
    }

    if (log) {
      results.push({ occurrence: occ, log });
    }
  }

  return results;
}
