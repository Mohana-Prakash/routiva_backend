import { DateTime } from 'luxon';
import { AppError } from '../errors/AppError';

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimeOfDay(value: string): boolean {
  return HH_MM_RE.test(value);
}

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const dt = DateTime.fromISO(value);
  return dt.isValid;
}

export function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}

/** Minutes since local midnight for an "HH:mm" string. */
export function timeToMinutes(time: string): number {
  const parts = time.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True when an entry's end time is earlier than its start time, i.e. it crosses midnight. */
export function crossesMidnight(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) <= timeToMinutes(startTime);
}

/**
 * Converts a local "HH:mm" wall-clock time on a given calendar date + IANA timezone
 * into an absolute UTC Date instant.
 */
export function localTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second: 0, millisecond: 0 },
    { zone: timezone },
  );
  if (!dt.isValid) {
    throw AppError.validation(`Invalid date/time/timezone combination: ${dt.invalidExplanation}`);
  }
  return dt.toUTC().toJSDate();
}

/** Adds `days` calendar days to a "YYYY-MM-DD" date string, returning a new date string. */
export function addDays(date: string, days: number): string {
  const dt = DateTime.fromISO(date).plus({ days });
  return dt.toFormat('yyyy-MM-dd');
}

/** Returns today's date (YYYY-MM-DD) as observed in the given IANA timezone. */
export function todayInTimezone(timezone: string): string {
  return DateTime.now().setZone(timezone).toFormat('yyyy-MM-dd');
}

/** 0 (Sunday) - 6 (Saturday) day-of-week for a "YYYY-MM-DD" date, timezone-agnostic (calendar date only). */
export function dayOfWeek(date: string): number {
  const dt = DateTime.fromISO(date);
  // luxon weekday: 1=Monday..7=Sunday. Convert to 0=Sunday..6=Saturday.
  return dt.weekday % 7;
}

export function assertValidDateString(value: string, field = 'date'): void {
  if (!isValidDateString(value)) {
    throw AppError.validation(`Invalid ${field}: must be YYYY-MM-DD`);
  }
}

export function assertValidTimeOfDay(value: string, field = 'time'): void {
  if (!isValidTimeOfDay(value)) {
    throw AppError.validation(`Invalid ${field}: must be HH:mm (24h)`);
  }
}
