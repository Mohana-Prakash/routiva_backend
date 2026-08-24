You are working on the Routiva backend repository.

IMPORTANT:
You have access to the complete existing backend codebase and previous implementation context. Before making any changes, inspect the existing architecture, Prisma schema, services, routes, jobs, notification implementation, environment configuration, and tests. Do not assume anything that can be verified from the code.

==================================================
PROJECT
==================================================

Application: Routiva

Routiva is a personal daily schedule/activity tracker.

Users can:

- Register/login
- Create categories
- Create activities
- Create daily/recurring schedules
- Track activity status
- Start/complete/skip activities
- Configure alarms for selected activities
- Receive notifications
- View reports
- Track their daily routine

Backend stack:

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Prisma
- Redis / Upstash
- Web Push
- VAPID
- BullMQ currently exists in the project
- Zod
- JWT authentication
- Argon2
- Pino logging

Deployment:

- Backend API is deployed on Render
- Frontend is deployed on Netlify
- PostgreSQL is Neon
- Redis is Upstash
- We are intentionally keeping the infrastructure at $0 cost

==================================================
CURRENT RENDER ARCHITECTURE
==================================================

Currently there is ONLY ONE Render service:

Routiva
└── Web Service

Current API service must continue running:

npm start

which runs:

node dist/server.js

DO NOT change the current Render Web Service to:

npm run worker:start

We considered creating a Render Background Worker for BullMQ, but Render requires a paid worker instance (~$7/month), and the project must currently remain completely free.

Therefore:

DO NOT create a Render Background Worker.

DO NOT require a separate always-running worker.

==================================================
DATABASE
==================================================

PostgreSQL is hosted on Neon.

Prisma is already configured.

The database schema has already been synchronized successfully.

Existing tables include, among others:

- users
- categories
- activities
- schedule_entries
- schedule_exceptions
- activity_logs
- notification_jobs
- notification_preferences
- push_subscriptions
- refresh_sessions
- password_reset_tokens
- audit_logs
- prisma_migrations

DO NOT recreate or redesign the database from scratch.

Inspect the existing Prisma schema and preserve existing functionality.

==================================================
REDIS
==================================================

Upstash Redis has already been created.

Redis is currently available to the backend through:

REDIS_URL

Do not remove Redis.

Redis may still be required for:

- caching
- rate limiting
- other existing infrastructure

==================================================
CURRENT BULLMQ IMPLEMENTATION
==================================================

The existing backend currently contains BullMQ and a separate worker implementation.

Relevant commands:

npm run worker:dev
npm run worker:start

The worker runs:

node dist/jobs/runWorkers.js

The existing worker is responsible for background processing, including scheduled notification/alarm processing.

IMPORTANT:

Do NOT delete BullMQ immediately.

Do NOT remove the worker code immediately.

First inspect exactly how BullMQ, notification_jobs, Redis, and Web Push currently work.

We want to migrate alarm scheduling safely.

Keep the existing implementation intact until the new QStash implementation is tested successfully.

==================================================
WEB PUSH / VAPID
==================================================

The project already uses Web Push.

VAPID is NOT related to BullMQ.

VAPID is used for Web Push authentication/delivery.

Existing VAPID configuration must remain intact.

Do not remove VAPID.

The conceptual architecture is:

Scheduling:
QStash

Notification delivery:
Web Push + VAPID

Client:
Service Worker / Android browser/PWA

==================================================
QSTASH
==================================================

We have now created a QStash account in Upstash.

QStash region:

US Region
AWS us-east-1

Plan:

FREE

Current free allowance shown by Upstash:

1,000 messages/day
50 GB monthly bandwidth

We intentionally selected QStash because we do not want to pay for a Render Background Worker.

QStash environment variables have ALREADY been added to the Render Routiva Web Service:

QSTASH_URL
QSTASH_TOKEN
QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY

The actual secret values must NEVER be hardcoded into source code.

Do not expose or print these secrets in logs.

==================================================
NEW TARGET ARCHITECTURE
==================================================

We want to replace the BullMQ-based alarm scheduling/processing with QStash.

Current:

Activity alarm
↓
BullMQ
↓
Redis
↓
BullMQ Worker
↓
Web Push + VAPID
↓
Android/browser notification

Target:

Activity alarm
↓
QStash
↓
Scheduled HTTP request
↓
Routiva API endpoint
↓
Web Push + VAPID
↓
Android/browser notification

The main benefit:

We no longer need an always-running worker.

Render continues running only:

npm start

QStash handles the scheduled delivery.

==================================================
VERY IMPORTANT: MIGRATION STRATEGY
==================================================

Do NOT immediately replace all BullMQ functionality.

Do this in stages.

PHASE 1:
Inspect the existing implementation.

Understand:

- BullMQ queues
- workers
- notification_jobs
- schedule processing
- alarm creation
- alarm cancellation
- push subscription handling
- VAPID
- activity lifecycle
- Redis usage

Report your findings before making destructive changes.

PHASE 2:
Implement a minimal QStash proof-of-concept.

Create a safe internal/test endpoint that can receive a QStash message.

The endpoint MUST verify the QStash signature using:

QSTASH_CURRENT_SIGNING_KEY
QSTASH_NEXT_SIGNING_KEY

Do not create an unauthenticated public callback endpoint.

Test:

Routiva API
↓
QStash
↓
Routiva callback endpoint

Verify the callback works.

PHASE 3:
Implement actual alarm scheduling through QStash.

When an activity has an alarm configured:

Routiva creates a QStash scheduled message.

The message should contain only the minimum required information, for example:

- user/activity/log identifier
- notification type
- relevant metadata

Do not put sensitive information into QStash payloads unnecessarily.

PHASE 4:
At alarm time:

QStash
↓
authenticated Routiva callback
↓
validate activity/alarm state
↓
send Web Push
↓
VAPID
↓
browser/service worker
↓
Android notification

The callback MUST re-check the database before sending.

For example:

- activity still exists
- activity is still active
- alarm is still enabled
- schedule wasn't cancelled
- user still has a valid push subscription
- notification hasn't already been processed

Avoid duplicate notifications.

PHASE 5:
Only after QStash alarm processing is fully tested:

Remove/migrate the relevant BullMQ alarm functionality.

Do NOT remove BullMQ if it is being used for any other important backend functionality.

If BullMQ is no longer required anywhere, then clean it up carefully.

==================================================
QSTASH SCHEDULING LIMITATION
==================================================

QStash Free has a maximum delay/window limitation for scheduled messages.

Therefore, do NOT design the system around scheduling a recurring alarm months or years into the future with one QStash message.

For recurring schedules, design a rolling scheduling mechanism.

For example:

Schedule only upcoming occurrences within the supported QStash scheduling window.

Then periodically create the next batch of scheduled messages.

The exact implementation must be based on the existing Routiva schedule model.

Do not invent a new scheduling model without checking the existing Prisma schema.

==================================================
NEW PRODUCT REQUIREMENTS
==================================================

We also have new product requirements that must eventually be implemented.

Do NOT implement all of them blindly in one huge change.

Implement in logical phases and test each phase.

---

1. AUTO COMPLETE AT END TIME

---

Once a user clicks START:

PLANNED
↓ START
IN_PROGRESS

When the scheduled end time is reached:

IN_PROGRESS
↓ automatic
COMPLETED

The user should NOT have to click Complete.

There must also be an END button while the activity is in progress.

If the user ends the activity before the scheduled end time:

IN_PROGRESS
↓ END
PARTIALLY_COMPLETED

Use the existing status model if possible; only introduce a new status if required.

---

2. HIDE ACTION BUTTONS AFTER END TIME

---

Once current time is greater than the activity's scheduled end time:

Do not display:

- Start
- End
- Complete
- Skip

Only show the final/current status:

- COMPLETED
- SKIPPED
- PARTIALLY_COMPLETED
- NOT_COMPLETED / MISSED

The backend must enforce the same business rules.

Do not rely only on frontend button hiding.

---

3. CATEGORIES CANNOT BE DELETED

---

NEW DECISION:

Categories must NOT be permanently deleted.

Remove permanent Delete functionality for categories.

Categories can only be:

ACTIVE
INACTIVE

Activities should not automatically disappear because a category is inactive.

Do not change activity deletion behavior unless specifically required.

---

4. CATEGORY DEACTIVATION

---

When the user tries to deactivate a category that has active activities:

Show confirmation:

"One or more active activities are linked to this category. Deactivating the category will also deactivate those activities. Are you sure?"

If user confirms:

- deactivate category
- deactivate all linked active activities

This must happen safely and transactionally in the backend.

If user cancels:

- no changes

Frontend confirmation is required.
Backend must also enforce correct state changes.

---

5. SLEEP ALARM

---

Sleep is just another activity.

There must be no special restriction preventing alarms for sleep activities.

If the user creates:

Sleep
22:00 → 04:00
Alarm ON

the alarm should be supported.

Do not hardcode special-case behavior based on the activity name "Sleep".

---

6. ALARM + SOUND

---

Alarm currently exists but must be investigated.

First determine why alarms are currently not firing.

Inspect:

- BullMQ
- worker
- notification_jobs
- Redis
- push subscriptions
- service worker
- Web Push
- VAPID
- Render deployment

Do not assume the problem.

We need actual end-to-end testing.

We also need alarm sound/vibration behavior on Android where browser/PWA capabilities allow it.

Important distinction:

VAPID/Web Push delivers the notification.
It does not itself generate the alarm sound.

Implement the appropriate client-side notification behavior.

Do not falsely promise native Clock-app-level behavior if browser/PWA restrictions prevent it.

---

7. DETAILED CATEGORY REPORTS

---

Reports already have some category-level functionality.

Do not rebuild unnecessarily.

Inspect existing reports first.

Enhance reports so each category can show useful detailed information, such as:

- total planned time
- actual tracked time
- completed activities
- skipped activities
- partially completed activities
- missed/not-completed activities
- completion percentage
- activity count
- date-range filtering

Support:

- weekly
- monthly
- custom date range

Use existing report architecture where possible.

---

8. ACTIVITIES WITHOUT CATEGORY

---

Category should be OPTIONAL.

A user must be able to create:

Activity
Category: None
Schedule: Daily

Do not force users to create/select a category.

Frontend currently requires a category; remove that restriction.

Backend already appears to support nullable categoryId, so verify and preserve it.

Reports should handle uncategorized activities clearly.

For example:

"Uncategorized"

---

9. TIMELESS ACTIVITIES

---

Activities should support two schedule types:

TIMED
TIMELESS

TIMED:

Study
07:30 → 08:45

TIMELESS:

Read Book
Daily
No fixed start/end time

A timeless activity can still be:

- started
- ended/completed
- skipped
- tracked
- included in reports

Do NOT assume timeless means "no reminders forever".

However, optional reminder support can be considered later.

This is a schema-level change if schedule start/end are currently mandatory.

Design it carefully and create a proper Prisma migration.

Do not break existing timed schedules.

==================================================
IMPLEMENTATION PRINCIPLES
==================================================

Production-grade requirements:

- TypeScript strict mode
- Zod validation
- Proper authentication/authorization
- Secure QStash signature verification
- No secrets in source code
- No secrets in logs
- Idempotent alarm processing
- Database transactions where required
- Correct timezone handling
- Race-condition-safe status transitions
- Proper error handling
- Structured logging
- Graceful shutdown
- Existing rate limiting must remain
- Existing security middleware must remain
- Existing CORS behavior must remain
- Existing JWT/cookie authentication must remain
- Existing API contracts should not be unnecessarily broken
- Backward compatibility for existing users/data
- Prisma migrations for schema changes
- Tests for positive and negative scenarios

==================================================
IMPORTANT TEST SCENARIOS
==================================================

For activity lifecycle:

1. Start before start time → rejected if existing business rule requires it
2. Start at valid time → success
3. Start after end time → rejected
4. End before scheduled end → PARTIALLY_COMPLETED
5. End at scheduled end → COMPLETED
6. Automatic completion at end time → COMPLETED
7. Skip before end → SKIPPED
8. Attempt Skip after end → rejected
9. Attempt Start after end → rejected
10. Duplicate Start → rejected/idempotent as appropriate
11. Duplicate End → rejected/idempotent
12. Multiple simultaneous requests → no inconsistent state

Category:

1. Deactivate category with no activities
2. Deactivate category with active activities
3. Cancel confirmation
4. Confirm cascade deactivation
5. Already inactive category
6. Reactivate category
7. Attempt category delete → must not be allowed

Uncategorized activity:

1. Create without category
2. Update without category
3. Track without category
4. Reports show Uncategorized
5. Category filters don't crash

Timeless activity:

1. Create timeless
2. Update timeless
3. Start timeless
4. End timeless
5. Skip timeless
6. Include in reports
7. Existing timed activities continue working

QStash:

1. Valid QStash signature
2. Invalid signature
3. Missing signature
4. Duplicate callback
5. Cancelled alarm
6. Disabled activity
7. Deleted/inactive subscription
8. Already processed notification
9. QStash timeout/error
10. Web Push failure
11. Expired push subscription

==================================================
DO NOT DO THESE THINGS
==================================================

- Do not create a Render Background Worker
- Do not change Render Web Service start command from npm start
- Do not delete BullMQ immediately
- Do not delete Redis
- Do not delete VAPID
- Do not hardcode QStash secrets
- Do not expose QStash secrets to frontend
- Do not put secrets into Git
- Do not redesign the entire database unnecessarily
- Do not break existing authentication
- Do not remove existing notification functionality before QStash is proven
- Do not implement all requirements in one giant untested commit
- Do not assume browser notifications behave exactly like native Android alarms

==================================================
CURRENT IMMEDIATE TASK
==================================================

Before changing anything:

1. Inspect the entire existing alarm/notification architecture.
2. Inspect BullMQ worker implementation.
3. Inspect notification_jobs.
4. Inspect Web Push/VAPID implementation.
5. Inspect push subscription implementation.
6. Inspect existing schedule processing.
7. Inspect current Prisma schema.
8. Inspect current environment configuration.
9. Identify exactly why alarms currently do not fire in production.
10. Identify what can be migrated to QStash and what should remain.

Then provide a concise implementation plan.

After that, implement ONLY the first safe QStash proof-of-concept/test.

Do not migrate or delete BullMQ yet.

The goal is:

QStash
↓
Render Routiva API
↓
verified callback
↓
test response/log

Once that works, we will proceed with the real alarm migration.

Treat this as a production application. Prefer small, testable, reversible changes over large rewrites.
