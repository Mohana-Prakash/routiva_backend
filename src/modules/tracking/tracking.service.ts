import { LogStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AppError } from '../../common/errors/AppError';
import { trackingRepository } from './tracking.repository';
import type { CompleteLogInput, CorrectLogInput, ListLogsQuery } from './tracking.validation';

const MAX_ACTUAL_DURATION_MINUTES = 24 * 60;

function assertValidActualRange(actualStart: Date, actualEnd: Date): void {
  if (actualEnd.getTime() <= actualStart.getTime()) {
    throw AppError.validation('actualEnd must be after actualStart');
  }
  const durationMinutes = (actualEnd.getTime() - actualStart.getTime()) / 60000;
  if (durationMinutes > MAX_ACTUAL_DURATION_MINUTES) {
    throw AppError.validation(`Actual duration cannot exceed ${MAX_ACTUAL_DURATION_MINUTES} minutes`);
  }
}

function dateStringToDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export const trackingService = {
  async getOwned(id: string, userId: string) {
    const log = await trackingRepository.findByIdForUser(id, userId);
    if (!log) throw AppError.notFound('Activity log not found');
    return log;
  },

  async list(userId: string, query: ListLogsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const [items, total] = await trackingRepository.list(userId, {
      from: query.from ? dateStringToDbDate(query.from) : undefined,
      to: query.to ? dateStringToDbDate(query.to) : undefined,
      date: query.date ? dateStringToDbDate(query.date) : undefined,
      status: query.status,
      activityId: query.activityId,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  },

  async start(id: string, userId: string) {
    await trackingService.getOwned(id, userId);

    const result = await trackingRepository.transitionStatus(id, userId, [LogStatus.PLANNED], {
      status: LogStatus.IN_PROGRESS,
      actualStart: new Date(),
    });

    if (result.count === 0) {
      // Another concurrent request may have won the race since `log` was read; re-fetch the
      // current row rather than trusting the pre-transition snapshot.
      const current = await trackingService.getOwned(id, userId);
      if (current.status === LogStatus.IN_PROGRESS) {
        return current;
      }
      throw AppError.invalidState(`Cannot start an activity log with status ${current.status}`);
    }

    return trackingService.getOwned(id, userId);
  },

  async complete(id: string, userId: string, input?: CompleteLogInput) {
    const log = await trackingService.getOwned(id, userId);

    const now = new Date();
    let actualStart: Date;
    let actualEnd: Date;
    if (input?.actualStart && input?.actualEnd) {
      // In-app "how long did you actually spend on this" prompt — explicit actuals.
      actualStart = new Date(input.actualStart);
      actualEnd = new Date(input.actualEnd);
      assertValidActualRange(actualStart, actualEnd);
    } else {
      // Simple one-tap completion (e.g. the headless notification-button path, which can't
      // show a prompt): a PLANNED/MISSED log has no actualStart yet, so back-fill it to now
      // (yielding a 0-minute actual duration) rather than requiring Start first.
      actualStart = log.actualStart ?? now;
      actualEnd = now;
    }

    // MISSED is included: the end-of-window sweep marking something MISSED is just a "this
    // wasn't acted on in time" label, not a final verdict — the user can still say what
    // actually happened instead of the system silently assuming an outcome either way.
    const result = await trackingRepository.transitionStatus(
      id,
      userId,
      [LogStatus.IN_PROGRESS, LogStatus.PLANNED, LogStatus.MISSED],
      { status: LogStatus.COMPLETED, actualStart, actualEnd, completedAt: now },
    );

    if (result.count === 0) {
      const current = await trackingService.getOwned(id, userId);
      if (current.status === LogStatus.COMPLETED) {
        return current;
      }
      throw AppError.invalidState(`Cannot complete an activity log with status ${current.status}`);
    }

    return trackingService.getOwned(id, userId);
  },

  async skip(id: string, userId: string) {
    const log = await trackingService.getOwned(id, userId);

    // Once actually started, skipping after the planned window has closed is meaningless —
    // the user engaged with it, so the only honest options left are Complete (say how long
    // they actually spent) or leaving it as is. MISSED is excluded entirely: it's already the
    // system's own "window passed, no action taken" label, so re-labeling it Skipped adds
    // nothing — Complete (if it actually happened elsewhere) is the only meaningful action left.
    if (log.status === LogStatus.IN_PROGRESS && log.plannedEnd && log.plannedEnd.getTime() < Date.now()) {
      throw AppError.invalidState('Cannot skip an activity that has already started and is past its scheduled end — complete it instead');
    }

    const result = await trackingRepository.transitionStatus(
      id,
      userId,
      [LogStatus.PLANNED, LogStatus.IN_PROGRESS],
      { status: LogStatus.SKIPPED },
    );

    if (result.count === 0) {
      const current = await trackingService.getOwned(id, userId);
      if (current.status === LogStatus.SKIPPED) {
        return current;
      }
      throw AppError.invalidState(`Cannot skip an activity log with status ${current.status}`);
    }

    return trackingService.getOwned(id, userId);
  },

  async correct(id: string, userId: string, input: CorrectLogInput) {
    const log = await trackingService.getOwned(id, userId);

    if (log.status !== LogStatus.COMPLETED && log.status !== LogStatus.IN_PROGRESS && log.status !== LogStatus.ADJUSTED) {
      throw AppError.invalidState('Only started, completed, or previously adjusted logs can be corrected');
    }

    const actualStart = input.actualStart ? new Date(input.actualStart) : log.actualStart;
    const actualEnd = input.actualEnd ? new Date(input.actualEnd) : log.actualEnd;

    if (actualStart && actualEnd) {
      assertValidActualRange(actualStart, actualEnd);
    }

    const nextStatus = log.status === LogStatus.IN_PROGRESS ? LogStatus.IN_PROGRESS : LogStatus.ADJUSTED;

    return trackingRepository.update(id, {
      actualStart,
      actualEnd,
      notes: input.notes !== undefined ? input.notes : log.notes,
      status: nextStatus,
    });
  },

  async dailySummary(userId: string, date: string) {
    const logs = await trackingRepository.dailySummaryAggregate(userId, dateStringToDbDate(date));

    const counts = {
      completed: 0,
      skipped: 0,
      missed: 0,
      upcoming: 0,
      current: 0,
      cancelled: 0,
      adjusted: 0,
      total: logs.length,
    };
    let plannedMinutes = 0;
    let actualMinutes = 0;

    for (const log of logs) {
      if (log.plannedStart && log.plannedEnd) {
        plannedMinutes += (log.plannedEnd.getTime() - log.plannedStart.getTime()) / 60000;
      }
      if (log.actualStart && log.actualEnd) {
        actualMinutes += (log.actualEnd.getTime() - log.actualStart.getTime()) / 60000;
      }
      switch (log.status) {
        case LogStatus.COMPLETED:
          counts.completed += 1;
          break;
        case LogStatus.ADJUSTED:
          counts.adjusted += 1;
          counts.completed += 1;
          break;
        case LogStatus.SKIPPED:
          counts.skipped += 1;
          break;
        case LogStatus.MISSED:
          counts.missed += 1;
          break;
        case LogStatus.CANCELLED:
          counts.cancelled += 1;
          break;
        case LogStatus.PLANNED:
          counts.upcoming += 1;
          break;
        case LogStatus.IN_PROGRESS:
          counts.current += 1;
          break;
      }
    }

    const trackable = counts.total - counts.cancelled;
    const completionPercentage = trackable > 0 ? Math.round((counts.completed / trackable) * 1000) / 10 : null;

    return {
      date,
      counts,
      plannedDurationMinutes: Math.round(plannedMinutes),
      actualDurationMinutes: Math.round(actualMinutes),
      completionPercentage,
      generatedAt: DateTime.utc().toISO(),
    };
  },
};
