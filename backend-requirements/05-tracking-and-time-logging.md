# Backend Requirements — Tracking & Historical Time Logging

## 1. Purpose

Tracking records what actually happened.

The historical record must remain accurate even when the user's current schedule changes.

## 2. Start Activity

Concept:

    POST /api/v1/activity-logs/:id/start

Rules:

- verify ownership
- verify activity is startable
- prevent duplicate active sessions
- record actual_start
- transition status to IN_PROGRESS

If already started:

- return existing state or an idempotent success
- do not create duplicate logs

## 3. Complete Activity

Concept:

    POST /api/v1/activity-logs/:id/complete

Rules:

- verify ownership
- set actual_end
- set status COMPLETED
- calculate actual duration
- set completed_at

If already completed, return idempotent state where appropriate.

## 4. Skip

Concept:

    POST /api/v1/activity-logs/:id/skip

Set status:

    SKIPPED

Do not fabricate actual duration.

## 5. Missed

A planned activity may become MISSED if its window expires without completion, depending on product policy.

This should be processed by a scheduled worker rather than relying solely on the browser.

## 6. Actual Time Corrections

Users may need to correct tracking.

Example:

Planned:
    18:00–18:30

Actual:
    18:05–18:35

Allow correction subject to validation.

Do not allow impossible values such as:

- actual end before actual start
- duration beyond configured limits without explicit policy

## 7. Historical Snapshot

Reports must remain meaningful after users rename an activity/category.

Store sufficient historical context to reproduce past reports.

## 8. Planned vs Actual

The backend should calculate:

- planned duration
- actual duration
- difference
- completion status
- consistency

Avoid doing complex business calculations independently in multiple clients.

## 9. Daily Summary

Provide an API for a user's day:

- completed count
- skipped count
- missed count
- upcoming count
- planned duration
- actual duration
- completion percentage

## 10. Concurrent Tracking

If two devices attempt to start/complete the same activity:

- do not create duplicate logs
- preserve a valid state
- return a deterministic response

Use transactions/conditional updates as appropriate.

## 11. Negative Scenarios

Test:

- completing without starting
- starting twice
- completing twice
- skipping completed activity
- completing skipped activity
- invalid actual time
- another user accessing the log
- malformed date
- duplicate request
- concurrent requests
- activity deleted after log creation

## 12. Historical Integrity

Never delete historical logs merely because:

- activity was archived
- category was renamed
- schedule changed
- user changed future recurrence
