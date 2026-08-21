# Backend Requirements — Reports & Analytics

## 1. Report Source of Truth

Reports must be calculated from historical activity logs and planned schedule information.

Do not calculate historical reports from today's current schedule alone.

## 2. Date Range

Support:

- today
- yesterday
- this week
- last week
- this month
- last month
- custom range

The backend should accept explicit:

- from
- to
- timezone

## 3. Summary Metrics

Provide:

- planned duration
- actual duration
- completion percentage
- completed activities
- skipped activities
- missed activities
- adjusted activities

## 4. Category Aggregation

Return totals by category.

Example:

    Spiritual: 25h 10m
    Study: 14h 40m
    Work: 27h 30m

## 5. Activity Aggregation

Provide per-activity:

- planned occurrences
- completed occurrences
- skipped occurrences
- missed occurrences
- planned duration
- actual duration
- consistency percentage

## 6. Planned vs Actual

Calculate:

    difference = actual - planned

Also expose a meaningful percentage where applicable.

Avoid division-by-zero.

## 7. Consistency

Example:

    completed_occurrences / planned_occurrences * 100

If no planned occurrences exist, return null rather than misleading 0%.

## 8. Daily Trend

Return one data point per day for the selected range.

Example:

    date
    planned_minutes
    actual_minutes
    completion_percentage

## 9. Weekly Report

Return enough data for the frontend to render:

- summary
- category breakdown
- daily trend
- top activities
- missed activities
- deviations

## 10. Monthly Report

Support:

- weekly trend within month
- category totals
- consistency
- planned vs actual
- most frequently skipped activities
- ad-hoc activity totals

## 11. Custom Range

Do not impose artificial week/month boundaries on custom ranges.

## 12. Performance

Reports must use indexed queries.

For large datasets:

- paginate detailed results
- aggregate in SQL where appropriate
- consider pre-aggregation only after measuring performance

## 13. Report Security

Every report query must be scoped to authenticated user.

A user must never be able to manipulate query parameters to retrieve another user's data.

## 14. Negative Scenarios

Test:

- empty range
- from after to
- invalid date
- huge date range
- future-only range
- timezone changes
- deleted/archived activities
- no completed activities
- zero planned occurrences
- duplicate logs
- partial data
