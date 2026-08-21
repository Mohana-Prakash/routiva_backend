import { LogStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { AppError } from '../../common/errors/AppError';
import { trackingRepository } from './tracking.repository';
import type { CorrectLogInput, ListLogsQuery } from './tracking.validation';

const MAX_ACTUAL_DURATION_MINUTES = 24 * 60;

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

  async complete(id: string, userId: string) {
    await trackingService.getOwned(id, userId);

    const now = new Date();
    const result = await trackingRepository.transitionStatus(id, userId, [LogStatus.IN_PROGRESS], {
      status: LogStatus.COMPLETED,
      actualEnd: now,
      completedAt: now,
    });

    if (result.count === 0) {
      const current = await trackingService.getOwned(id, userId);
      if (current.status === LogStatus.COMPLETED) {
        return current;
      }
      if (current.status === LogStatus.PLANNED) {
        throw AppError.invalidState('Activity must be started before it can be completed');
      }
      throw AppError.invalidState(`Cannot complete an activity log with status ${current.status}`);
    }

    return trackingService.getOwned(id, userId);
  },

  async skip(id: string, userId: string) {
    await trackingService.getOwned(id, userId);

    const result = await trackingRepository.transitionStatus(id, userId, [LogStatus.PLANNED, LogStatus.IN_PROGRESS], {
      status: LogStatus.SKIPPED,
    });

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
      if (actualEnd.getTime() <= actualStart.getTime()) {
        throw AppError.validation('actualEnd must be after actualStart');
      }
      const durationMinutes = (actualEnd.getTime() - actualStart.getTime()) / 60000;
      if (durationMinutes > MAX_ACTUAL_DURATION_MINUTES) {
        throw AppError.validation(`Actual duration cannot exceed ${MAX_ACTUAL_DURATION_MINUTES} minutes`);
      }
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

    const counts = { completed: 0, skipped: 0, missed: 0, upcoming: 0, cancelled: 0, adjusted: 0, total: logs.length };
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
        case LogStatus.IN_PROGRESS:
          counts.upcoming += 1;
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
