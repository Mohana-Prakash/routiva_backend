import { timeToMinutes } from './time';

export interface MinuteInterval {
  start: number; // minutes from local midnight, inclusive
  end: number; // minutes from local midnight, exclusive, may exceed 1440 to represent midnight crossing
}

/**
 * Converts a start/end "HH:mm" pair into one interval on a 0..2880 minute axis.
 * When the entry crosses midnight (end <= start), end is represented as end+1440
 * so the interval spans past the day boundary, allowing simple numeric comparison.
 */
export function toMinuteInterval(startTime: string, endTime: string): MinuteInterval {
  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);
  if (end <= start) {
    end += 1440;
  }
  return { start, end };
}

/**
 * True if two intervals (each possibly wrapping past midnight, represented on the same
 * 0..2880 axis) overlap, accounting for the fact that a wrapped interval also occupies
 * the equivalent slot shifted back by one day.
 */
export function intervalsOverlap(a: MinuteInterval, b: MinuteInterval): boolean {
  const variants = (iv: MinuteInterval): MinuteInterval[] => [
    iv,
    { start: iv.start - 1440, end: iv.end - 1440 },
    { start: iv.start + 1440, end: iv.end + 1440 },
  ];

  for (const av of variants(a)) {
    for (const bv of variants(b)) {
      if (av.start < bv.end && bv.start < av.end) {
        return true;
      }
    }
  }
  return false;
}

export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return intervalsOverlap(toMinuteInterval(aStart, aEnd), toMinuteInterval(bStart, bEnd));
}
