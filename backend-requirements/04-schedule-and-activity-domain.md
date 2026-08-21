# Backend Requirements — Schedule & Activity Domain

## 1. Design Goal

The schedule engine must support both predictable daily routines and flexible real-world changes.

Users can customize their entire day.

## 2. Base Schedule

Users can create recurring schedule entries.

Example:

- Meditation 04:00–04:30 daily
- Murli 04:30–05:00 daily
- Study 07:30–08:45 daily

The backend must store the recurring definition, not merely today's rendered records.

## 3. Recurrence

The initial implementation must support:

- Daily
- Selected weekdays
- One-time

The model should be extensible for:

- weekly patterns
- monthly patterns
- date exclusions

Do not over-engineer recurrence before required use cases exist.

## 4. Midnight

Support schedules crossing midnight.

Example:

    23:30 → 00:30

The backend must correctly associate the activity with the intended schedule date.

## 5. Overlap Rules

Overlaps should not be silently created when they violate configured schedule rules.

Return a conflict response such as:

    409 SCHEDULE_CONFLICT

Include conflicting entries.

The API should support an explicit override when product rules permit it.

## 6. Ad-hoc Activities

Allow date-specific activities.

Examples:

- Play 20:00–22:30
- Appointment
- Travel
- Event

These must not modify the recurring base schedule.

## 7. Exceptions

Support:

- MOVE
- SKIP
- ADD
- REPLACE

Example:

Normal:
    Meditation 21:30–22:00

Today:
    Meditation 22:30–23:00

Only today's rendered schedule changes.

## 8. Schedule Rendering

Provide an endpoint that returns the effective schedule for a date.

Concept:

    GET /api/v1/schedules/date/:date

The service should combine:

1. base recurring schedule
2. date-specific exceptions
3. one-time activities

Return a deterministic chronological timeline.

## 9. Activity CRUD

Support:

- create
- retrieve
- update
- archive/deactivate

Activity names should be validated.

Prevent invalid category ownership.

## 10. Alarm Configuration

Alarm is optional per activity/schedule occurrence.

Validate:

- enabled/disabled
- offset
- valid time window

Do not schedule notifications for disabled alarms.

## 11. Schedule Update Semantics

When updating a recurring schedule, the API must make the scope explicit:

- this occurrence only
- this and future occurrences
- entire recurring rule

Do not silently change historical data.

## 12. Delete Semantics

Deleting/archiving a recurring activity must not delete activity logs.

The effective schedule for future dates should stop including the archived entry.

## 13. Negative Scenarios

Test:

- overlapping activities
- invalid time
- start after end
- invalid date
- unauthorized activity
- unauthorized category
- inactive activity used in a new schedule
- conflicting exception
- duplicate recurring rule
- invalid recurrence
- modification of historical schedule
- cross-user schedule access
- duplicate request
- concurrent updates

## 14. Flexible Future Extension

The schedule engine should be designed so later features can add:

- holidays
- templates
- copied schedules
- vacation mode
- alternate weekday schedules
- temporary schedule profiles

without breaking the core data model.
