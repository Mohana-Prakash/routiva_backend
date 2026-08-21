import { Prisma, LogStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';

export const trackingRepository = {
  findByIdForUser(id: string, userId: string) {
    return prisma.activityLog.findFirst({ where: { id, userId } });
  },

  findByOccurrenceKey(userId: string, occurrenceKey: string) {
    return prisma.activityLog.findUnique({ where: { userId_occurrenceKey: { userId, occurrenceKey } } });
  },

  listForDate(userId: string, date: Date) {
    return prisma.activityLog.findMany({
      where: { userId, activityDate: date },
      orderBy: [{ plannedStart: 'asc' }, { createdAt: 'asc' }],
    });
  },

  list(userId: string, filters: {
    from?: Date;
    to?: Date;
    date?: Date;
    status?: LogStatus;
    activityId?: string;
    skip: number;
    take: number;
  }) {
    const where: Prisma.ActivityLogWhereInput = {
      userId,
      ...(filters.date ? { activityDate: filters.date } : {}),
      ...(filters.from && filters.to ? { activityDate: { gte: filters.from, lte: filters.to } } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.activityId ? { activityId: filters.activityId } : {}),
    };

    return Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: [{ activityDate: 'desc' }, { plannedStart: 'asc' }],
        skip: filters.skip,
        take: filters.take,
      }),
      prisma.activityLog.count({ where }),
    ]);
  },

  createPlanned(data: {
    userId: string;
    activityId: string;
    scheduleEntryId: string | null;
    exceptionId: string | null;
    activityDate: Date;
    plannedStart: Date;
    plannedEnd: Date;
    activityNameSnapshot: string;
    categoryNameSnapshot: string | null;
    occurrenceKey: string;
  }) {
    return prisma.activityLog.create({ data: { ...data, status: LogStatus.PLANNED } });
  },

  /** Conditional update: only succeeds if the row currently matches `whereStatus`. Returns affected row count. */
  transitionStatus(
    id: string,
    userId: string,
    whereStatus: LogStatus[],
    data: Prisma.ActivityLogUpdateManyMutationInput,
  ) {
    return prisma.activityLog.updateMany({
      where: { id, userId, status: { in: whereStatus } },
      data,
    });
  },

  update(id: string, data: Prisma.ActivityLogUpdateInput) {
    return prisma.activityLog.update({ where: { id }, data });
  },

  /**
   * Removes not-yet-acted-upon (PLANNED) placeholder logs tied to a schedule entry, from a
   * given date forward. Called when a schedule entry is edited/archived so stale placeholders
   * are regenerated from the current definition on next render. Logs with any other status
   * represent real user interaction and are never touched.
   */
  findFuturePlannedLogIdsForEntry(scheduleEntryId: string, fromDate: Date) {
    return prisma.activityLog
      .findMany({ where: { scheduleEntryId, status: LogStatus.PLANNED, activityDate: { gte: fromDate } }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
  },

  deleteFuturePlannedLogsForEntry(scheduleEntryId: string, fromDate: Date) {
    return prisma.activityLog.deleteMany({
      where: { scheduleEntryId, status: LogStatus.PLANNED, activityDate: { gte: fromDate } },
    });
  },

  countActiveForActivity(activityId: string) {
    return prisma.activityLog.count({
      where: { activityId, status: { in: [LogStatus.PLANNED, LogStatus.IN_PROGRESS] } },
    });
  },

  dailySummaryAggregate(userId: string, date: Date) {
    return prisma.activityLog.findMany({ where: { userId, activityDate: date } });
  },

  findExpiredPlanned(userId: string, beforeUtc: Date) {
    return prisma.activityLog.findMany({
      where: { userId, status: LogStatus.PLANNED, plannedEnd: { lt: beforeUtc } },
    });
  },

  markMissed(ids: string[]) {
    return prisma.activityLog.updateMany({
      where: { id: { in: ids }, status: LogStatus.PLANNED },
      data: { status: LogStatus.MISSED },
    });
  },
};
