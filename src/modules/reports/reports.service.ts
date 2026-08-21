import { DateTime } from 'luxon';
import { prisma } from '../../db/prisma';
import { reportsRepository } from './reports.repository';

function dateStringToDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function consistencyPercentage(completed: number, trackable: number): number | null {
  if (trackable <= 0) return null;
  return round1((completed / trackable) * 100);
}

export const reportsService = {
  async summary(userId: string, from: string, to: string) {
    const [row] = await reportsRepository.summary(userId, dateStringToDbDate(from), dateStringToDbDate(to));
    const completed = Number(row?.completed ?? 0);
    const trackable = Number(row?.trackable ?? 0);
    const plannedMinutes = Math.round(Number(row?.planned_minutes ?? 0));
    const actualMinutes = Math.round(Number(row?.actual_minutes ?? 0));

    return {
      range: { from, to },
      plannedDurationMinutes: plannedMinutes,
      actualDurationMinutes: actualMinutes,
      differenceMinutes: actualMinutes - plannedMinutes,
      completionPercentage: consistencyPercentage(completed, trackable),
      completed,
      skipped: Number(row?.skipped ?? 0),
      missed: Number(row?.missed ?? 0),
      adjusted: Number(row?.adjusted ?? 0),
      cancelled: Number(row?.cancelled ?? 0),
      total: Number(row?.total ?? 0),
    };
  },

  async categories(userId: string, from: string, to: string) {
    const rows = await reportsRepository.categories(userId, dateStringToDbDate(from), dateStringToDbDate(to));
    return rows.map((row) => {
      const completed = Number(row.completed);
      const total = Number(row.total);
      return {
        categoryName: row.category_name,
        plannedDurationMinutes: Math.round(Number(row.planned_minutes)),
        actualDurationMinutes: Math.round(Number(row.actual_minutes)),
        completed,
        total,
        completionPercentage: consistencyPercentage(completed, total),
      };
    });
  },

  async activities(userId: string, from: string, to: string) {
    const rows = await reportsRepository.activities(userId, dateStringToDbDate(from), dateStringToDbDate(to));
    if (rows.length === 0) return [];

    const activityIds = rows.map((r) => r.activity_id);
    const activities = await prisma.activity.findMany({
      where: { id: { in: activityIds } },
      select: { id: true, name: true, category: { select: { name: true } } },
    });
    const byId = new Map(activities.map((a) => [a.id, a]));

    return rows.map((row) => {
      const plannedOccurrences = Number(row.planned_occurrences);
      const completedOccurrences = Number(row.completed_occurrences);
      const activity = byId.get(row.activity_id);
      return {
        activityId: row.activity_id,
        activityName: activity?.name ?? 'Unknown activity',
        categoryName: activity?.category?.name ?? null,
        plannedOccurrences,
        completedOccurrences,
        skippedOccurrences: Number(row.skipped_occurrences),
        missedOccurrences: Number(row.missed_occurrences),
        plannedDurationMinutes: Math.round(Number(row.planned_minutes)),
        actualDurationMinutes: Math.round(Number(row.actual_minutes)),
        consistencyPercentage: consistencyPercentage(completedOccurrences, plannedOccurrences),
      };
    });
  },

  async dailyTrend(userId: string, from: string, to: string) {
    const rows = await reportsRepository.dailyTrend(userId, dateStringToDbDate(from), dateStringToDbDate(to));
    return rows.map((row) => {
      const total = Number(row.total);
      const completed = Number(row.completed);
      return {
        date: DateTime.fromJSDate(row.activity_date, { zone: 'utc' }).toFormat('yyyy-MM-dd'),
        plannedMinutes: Math.round(Number(row.planned_minutes)),
        actualMinutes: Math.round(Number(row.actual_minutes)),
        completionPercentage: consistencyPercentage(completed, total),
      };
    });
  },
};
