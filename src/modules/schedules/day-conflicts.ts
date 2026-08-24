import type { RenderedOccurrence } from './schedules.types';

/**
 * Flags occurrences within a single rendered day whose absolute UTC windows overlap each
 * other. Uses the already-resolved plannedStart/EndUtc instants, so midnight-crossing
 * occurrences compare correctly without any extra wrap-around logic.
 */
export function computeSameDayConflicts(occurrences: RenderedOccurrence[]): Map<string, string[]> {
  const conflictsByKey = new Map<string, string[]>();

  for (let i = 0; i < occurrences.length; i += 1) {
    for (let j = i + 1; j < occurrences.length; j += 1) {
      const a = occurrences[i] as RenderedOccurrence;
      const b = occurrences[j] as RenderedOccurrence;
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
