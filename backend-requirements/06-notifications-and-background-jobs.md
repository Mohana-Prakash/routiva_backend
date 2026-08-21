# Backend Requirements — Notifications & Background Jobs

## 1. Purpose

Provide reliable reminders for activities with alarms enabled.

Browser JavaScript timers are not the source of truth.

The backend scheduler/worker system must determine when reminders should be delivered.

## 2. Infrastructure

Use:

- Redis
- BullMQ

Queues should be separated logically.

Example:

- notification queue
- schedule processing queue
- cleanup queue
- report queue if needed

## 3. Notification Lifecycle

Concept:

    Schedule created
       ↓
    Alarm enabled
       ↓
    Notification job created
       ↓
    Job becomes due
       ↓
    Worker sends Web Push
       ↓
    Result recorded
       ↓
    Failed jobs retried according to policy

## 4. Job Idempotency

A reminder must not be delivered repeatedly because of duplicate scheduling.

Use a deterministic job identifier based on:

- user
- activity occurrence
- alarm configuration

## 5. Push Subscription

Endpoint concept:

    POST /api/v1/notifications/push/subscribe

Validate subscription structure.

Associate subscription with authenticated user.

Allow multiple devices per user.

## 6. Multiple Devices

A user may have:

- desktop browser
- laptop
- mobile browser

Notifications may be sent to all active subscriptions or according to future device preferences.

## 7. Invalid Subscriptions

If Web Push reports a permanently invalid subscription:

- mark subscription inactive/revoked
- do not retry indefinitely

## 8. Retry

Transient failures should retry with bounded backoff.

Permanent failures should not be retried indefinitely.

## 9. Alarm Offset

If activity starts at 18:00 and alarm offset is 5:

notification time:

    17:55

If notification time has already passed when a schedule is created, define deterministic behavior:

- do not send stale reminder by default

## 10. Schedule Changes

If an activity is moved:

- cancel obsolete notification job
- create new notification job

If alarm is disabled:

- cancel pending notification job

## 11. Daily Schedule Regeneration

The system must safely reconcile jobs when:

- recurring schedule changes
- exceptions are added
- activity is archived
- alarm settings change

Do not create duplicate jobs.

## 12. Quiet Hours

If quiet hours are enabled, notification behavior must follow user settings.

Possible policies:

- suppress
- delay until quiet hours end

The policy must be explicit.

## 13. Notification History

Track useful operational fields:

- scheduled_at
- sent_at
- status
- failure reason
- attempts

Do not store unnecessary notification payload data.

## 14. Negative Scenarios

Test:

- Redis unavailable
- worker restart
- duplicate job creation
- push subscription expired
- push provider failure
- activity deleted
- alarm disabled
- schedule moved
- user logged out
- quiet hours
- timezone change
- daylight-saving transition where applicable

## 15. Worker Safety

Workers must be restart-safe.

No job should depend on in-memory state that disappears after process restart.
