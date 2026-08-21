import { prisma } from '../../db/prisma';

const DURATION_MINUTES_SQL_PLANNED = `COALESCE(SUM(EXTRACT(EPOCH FROM (planned_end - planned_start)) / 60) FILTER (WHERE planned_start IS NOT NULL AND planned_end IS NOT NULL), 0)`;
const DURATION_MINUTES_SQL_ACTUAL = `COALESCE(SUM(EXTRACT(EPOCH FROM (actual_end - actual_start)) / 60) FILTER (WHERE actual_start IS NOT NULL AND actual_end IS NOT NULL), 0)`;

export interface SummaryRow {
  completed: bigint;
  skipped: bigint;
  missed: bigint;
  adjusted: bigint;
  cancelled: bigint;
  trackable: bigint;
  total: bigint;
  planned_minutes: number;
  actual_minutes: number;
}

export interface CategoryRow {
  category_name: string;
  completed: bigint;
  total: bigint;
  planned_minutes: number;
  actual_minutes: number;
}

export interface ActivityRow {
  activity_id: string;
  planned_occurrences: bigint;
  completed_occurrences: bigint;
  skipped_occurrences: bigint;
  missed_occurrences: bigint;
  planned_minutes: number;
  actual_minutes: number;
}

export interface DailyTrendRow {
  activity_date: Date;
  total: bigint;
  completed: bigint;
  planned_minutes: number;
  actual_minutes: number;
}

export const reportsRepository = {
  summary(userId: string, from: Date, to: Date) {
    return prisma.$queryRawUnsafe<SummaryRow[]>(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('COMPLETED','ADJUSTED')) AS completed,
        COUNT(*) FILTER (WHERE status = 'SKIPPED') AS skipped,
        COUNT(*) FILTER (WHERE status = 'MISSED') AS missed,
        COUNT(*) FILTER (WHERE status = 'ADJUSTED') AS adjusted,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled,
        COUNT(*) FILTER (WHERE status != 'CANCELLED') AS trackable,
        COUNT(*) AS total,
        ${DURATION_MINUTES_SQL_PLANNED} AS planned_minutes,
        ${DURATION_MINUTES_SQL_ACTUAL} AS actual_minutes
      FROM activity_logs
      WHERE user_id = $1 AND activity_date BETWEEN $2 AND $3`,
      userId,
      from,
      to,
    );
  },

  categories(userId: string, from: Date, to: Date) {
    return prisma.$queryRawUnsafe<CategoryRow[]>(
      `SELECT
        COALESCE(category_name_snapshot, 'Uncategorized') AS category_name,
        COUNT(*) FILTER (WHERE status IN ('COMPLETED','ADJUSTED')) AS completed,
        COUNT(*) AS total,
        ${DURATION_MINUTES_SQL_PLANNED} AS planned_minutes,
        ${DURATION_MINUTES_SQL_ACTUAL} AS actual_minutes
      FROM activity_logs
      WHERE user_id = $1 AND activity_date BETWEEN $2 AND $3
      GROUP BY COALESCE(category_name_snapshot, 'Uncategorized')
      ORDER BY actual_minutes DESC`,
      userId,
      from,
      to,
    );
  },

  activities(userId: string, from: Date, to: Date) {
    return prisma.$queryRawUnsafe<ActivityRow[]>(
      `SELECT
        activity_id,
        COUNT(*) FILTER (WHERE status != 'CANCELLED') AS planned_occurrences,
        COUNT(*) FILTER (WHERE status IN ('COMPLETED','ADJUSTED')) AS completed_occurrences,
        COUNT(*) FILTER (WHERE status = 'SKIPPED') AS skipped_occurrences,
        COUNT(*) FILTER (WHERE status = 'MISSED') AS missed_occurrences,
        ${DURATION_MINUTES_SQL_PLANNED} AS planned_minutes,
        ${DURATION_MINUTES_SQL_ACTUAL} AS actual_minutes
      FROM activity_logs
      WHERE user_id = $1 AND activity_date BETWEEN $2 AND $3
      GROUP BY activity_id
      ORDER BY actual_minutes DESC`,
      userId,
      from,
      to,
    );
  },

  dailyTrend(userId: string, from: Date, to: Date) {
    return prisma.$queryRawUnsafe<DailyTrendRow[]>(
      `SELECT
        activity_date,
        COUNT(*) FILTER (WHERE status != 'CANCELLED') AS total,
        COUNT(*) FILTER (WHERE status IN ('COMPLETED','ADJUSTED')) AS completed,
        ${DURATION_MINUTES_SQL_PLANNED} AS planned_minutes,
        ${DURATION_MINUTES_SQL_ACTUAL} AS actual_minutes
      FROM activity_logs
      WHERE user_id = $1 AND activity_date BETWEEN $2 AND $3
      GROUP BY activity_date
      ORDER BY activity_date ASC`,
      userId,
      from,
      to,
    );
  },
};
