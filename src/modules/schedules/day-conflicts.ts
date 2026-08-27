import type { ActivityLog } from '@prisma/client';
import type { RenderedOccurrence } from './schedules.types';

// Once an occurrence's outcome is settled, its planned slot is no longer actually occupying
// that time — a SKIPPED or COMPLETED (etc.) item shouldn't block or flag against something
// else scheduled into the same window. Only still-pending occurrences can truly conflict.
const BLOCKING_LOG_STATUSES = new Set<ActivityLog['status']>(['PLANNED', 'IN_PROGRESS']);

/**
 * Flags occurrences within a single rendered day whose absolute UTC windows overlap each
 * other. Uses the already-resolved plannedStart/EndUtc instants, so midnight-crossing
 * occurrences compare correctly without any extra wrap-around logic.
 */
export function computeSameDayConflicts(
  materialized: Array<{ occurrence: RenderedOccurrence; log: Pick<ActivityLog, 'status'> }>,
): Map<string, string[]> {
  const conflictsByKey = new Map<string, string[]>();
  const candidates = materialized.filter((m) => BLOCKING_LOG_STATUSES.has(m.log.status));

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i]?.occurrence as RenderedOccurrence;
      const b = candidates[j]?.occurrence as RenderedOccurrence;
      // Timeless occurrences (no fixed slot) can never conflict with anything.
      if (!a.plannedStartUtc || !a.plannedEndUtc || !b.plannedStartUtc || !b.plannedEndUtc) continue;
      const overlaps = a.plannedStartUtc.getTime() < b.plannedEndUtc.getTime() && b.plannedStartUtc.getTime() < a.plannedEndUtc.getTime();
      if (!overlaps) continue;

      if (!conflictsByKey.has(a.occurrenceKey)) conflictsByKey.set(a.occurrenceKey, []);
      if (!conflictsByKey.has(b.occurrenceKey)) conflictsByKey.set(b.occurrenceKey, []);
      conflictsByKey.get(a.occurrenceKey)?.push(b.occurrenceKey);
      conflictsByKey.get(b.occurrenceKey)?.push(a.occurrenceKey);
    }
  }

  return conflictsByKey;
}
