# Backend Requirements — PostgreSQL & Data Model

## 1. Database

Use PostgreSQL as the system of record.

Use Prisma ORM with migrations.

Do not rely on Prisma `db push` for production schema management.

Production schema changes must use versioned migrations.

## 2. Core Entities

Minimum entities:

- users
- refresh_sessions
- password_reset_tokens
- categories
- activities
- schedule_entries
- schedule_exceptions
- activity_logs
- push_subscriptions
- notification_preferences
- notification_jobs
- audit_logs

Additional tables may be introduced when required.

## 3. Users

Fields should conceptually include:

- id
- name
- email
- password_hash
- timezone
- status
- created_at
- updated_at
- last_login_at

Email must be normalized.

Email must have a unique constraint.

Never store plaintext passwords.

## 4. Refresh Sessions

Track refresh sessions independently so users can:

- log out one session
- revoke all sessions
- invalidate compromised sessions

Store a hash/fingerprint of refresh tokens rather than plaintext long-lived tokens where possible.

Include:

- user_id
- token_hash
- expires_at
- revoked_at
- created_at
- last_used_at
- user_agent
- IP metadata where legally/operationally appropriate

## 5. Categories

Fields:

- id
- user_id
- name
- icon
- color
- is_active
- created_at
- updated_at

Category name should be unique per user where appropriate.

## 6. Activities

An activity is a reusable definition.

Fields:

- id
- user_id
- category_id
- name
- description/notes
- default_duration
- alarm_enabled
- alarm_offset_minutes
- is_active
- created_at
- updated_at
- archived_at

Deleting an activity should not delete historical logs.

## 7. Schedule Entries

A schedule entry defines recurring/base routine behavior.

Fields should include:

- id
- user_id
- activity_id
- start_time
- end_time
- recurrence_rule or structured recurrence fields
- is_active
- created_at
- updated_at

Do not store only a rendered list of future dates.

The recurring definition is the source for generating a day's planned schedule.

## 8. Schedule Exceptions

Used for date-specific changes.

Examples:

- move meditation today
- skip study today
- add play tonight

Fields:

- id
- user_id
- source_schedule_entry_id nullable
- activity_id
- date
- start_time
- end_time
- action
- reason
- created_at
- updated_at

Actions may include:

- MOVE
- SKIP
- ADD
- REPLACE

## 9. Activity Logs

This is historical data.

Fields:

- id
- user_id
- activity_id
- schedule_entry_id nullable
- exception_id nullable
- activity_date
- planned_start
- planned_end
- actual_start
- actual_end
- status
- notes
- created_at
- updated_at
- completed_at

Historical logs must not depend on the current activity name/category alone.

Where reporting accuracy requires it, preserve relevant snapshots such as activity name/category at execution time.

## 10. Status Values

Use explicit enum values.

Suggested:

- PLANNED
- IN_PROGRESS
- COMPLETED
- SKIPPED
- CANCELLED
- MISSED
- ADJUSTED

Do not use arbitrary free-text status values.

## 11. Push Subscriptions

Store:

- user_id
- endpoint
- p256dh
- auth
- user_agent
- created_at
- last_used_at
- revoked_at

The endpoint should be uniquely constrained where appropriate.

## 12. Notification Preferences

Store:

- user_id
- push_enabled
- default_alarm_offset
- quiet_hours_enabled
- quiet_hours_start
- quiet_hours_end
- created_at
- updated_at

Activity-level alarm configuration remains independent.

## 13. Audit Logs

Security-sensitive operations should be auditable.

Examples:

- login failure threshold
- password reset
- password change
- session revocation
- notification subscription changes
- schedule changes

Do not log passwords, tokens, or sensitive secrets.

## 14. Indexing

At minimum consider indexes for:

- users.email
- activities.user_id
- schedule_entries.user_id
- schedule_exceptions.user_id + date
- activity_logs.user_id + activity_date
- activity_logs.user_id + status
- push_subscriptions.user_id
- notification_jobs.scheduled_at + status

Indexes must be reviewed using real query patterns.

## 15. Referential Integrity

Use foreign keys.

Define deletion behavior intentionally.

Never use cascading deletion in a way that can accidentally erase historical activity data.

## 16. Data Retention

Define retention policies for:

- activity logs
- notification jobs
- audit logs
- expired password reset tokens
- expired sessions

Retention should be configurable.

## 17. Migration Safety

Production migrations must:

- be backward compatible where possible
- avoid unnecessary table locks
- be tested against a production-like database
- have rollback/recovery procedures where feasible
