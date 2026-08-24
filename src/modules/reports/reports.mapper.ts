const DEFAULT_CATEGORY_COLOR = '#64748b';

interface SummaryDomain {
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  differenceMinutes: number;
  completionPercentage: number | null;
  completed: number;
  skipped: number;
  missed: number;
  adjusted: number;
}

interface CategoryDomain {
  categoryId: string | null;
  categoryName: string;
  categoryColor: string | null;
  actualDurationMinutes: number;
  plannedDurationMinutes: number;
  completionPercentage: number | null;
  completed: number;
  total: number;
}

interface ActivityDomain {
  activityId: string;
  activityName: string;
  categoryId: string | null;
  categoryName: string | null;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  plannedOccurrences: number;
  completedOccurrences: number;
  skippedOccurrences: number;
  consistencyPercentage: number | null;
}

interface DailyTrendDomain {
  date: string;
  plannedMinutes: number;
  actualMinutes: number;
  completionPercentage: number | null;
}

// Frontend's report types (types/reports.ts) treat rate/percentage fields as plain numbers,
// with no null case in the UI (Math.round(item.rate) etc. with no null-guard) — 0 is the
// honest "no data yet" value there, so nulls from the domain layer are defaulted at this
// wire boundary rather than propagated.
export function toReportSummaryDto(s: SummaryDomain) {
  return {
    totalPlannedMinutes: s.plannedDurationMinutes,
    totalActualMinutes: s.actualDurationMinutes,
    completionRate: s.completionPercentage ?? 0,
    completedCount: s.completed,
    skippedCount: s.skipped,
    adjustedCount: s.adjusted,
    missedCount: s.missed,
    plannedVsActualDiffMinutes: s.differenceMinutes,
  };
}

export function toCategoryReportDto(c: CategoryDomain) {
  return {
    categoryId: c.categoryId ?? c.categoryName,
    categoryName: c.categoryName,
    categoryColor: c.categoryColor ?? DEFAULT_CATEGORY_COLOR,
    plannedMinutes: c.plannedDurationMinutes,
    actualMinutes: c.actualDurationMinutes,
    completionRate: c.completionPercentage ?? 0,
    completedCount: c.completed,
    totalCount: c.total,
  };
}

export function toActivityReportDto(a: ActivityDomain) {
  const achievementRate = a.plannedDurationMinutes > 0 ? Math.round((a.actualDurationMinutes / a.plannedDurationMinutes) * 100) : 0;
  return {
    activityId: a.activityId,
    activityName: a.activityName,
    categoryId: a.categoryId,
    categoryName: a.categoryName ?? 'Uncategorized',
    plannedMinutes: a.plannedDurationMinutes,
    actualMinutes: a.actualDurationMinutes,
    achievementRate,
    consistencyCompletedSessions: a.completedOccurrences,
    consistencyTotalSessions: a.plannedOccurrences,
    consistencyRate: a.consistencyPercentage ?? 0,
    skippedSessions: a.skippedOccurrences,
  };
}

export function toDailyTrendPointDto(d: DailyTrendDomain) {
  return {
    date: d.date,
    plannedMinutes: d.plannedMinutes,
    actualMinutes: d.actualMinutes,
    completionPercentage: d.completionPercentage ?? 0,
  };
}
