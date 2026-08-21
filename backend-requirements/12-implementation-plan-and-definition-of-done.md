# Backend Requirements — Implementation Plan & Definition of Done

## Phase 1 — Foundation

Build:

- Express application
- TypeScript
- configuration validation
- logger
- error handling
- request ID
- security middleware
- PostgreSQL
- Prisma
- migration setup
- health endpoints
- Swagger/OpenAPI

Acceptance:

- server starts
- invalid environment configuration fails fast
- database connection works
- health endpoints work
- API errors have consistent format

## Phase 2 — Authentication

Build:

- registration
- login
- refresh
- logout
- logout all
- forgot password
- reset password
- session management
- rate limits

Acceptance:

- authentication works securely
- users are isolated
- passwords are hashed
- sessions can be revoked

## Phase 3 — User & Categories

Build:

- current user profile
- timezone
- category CRUD
- default category initialization if desired

Acceptance:

- users can manage their own categories
- cross-user access is blocked

## Phase 4 — Activities

Build:

- activity CRUD
- archive/deactivate
- alarm settings
- category ownership validation

Acceptance:

- historical records survive activity archival

## Phase 5 — Schedule Engine

Build:

- recurring schedules
- one-time schedules
- effective daily schedule
- exceptions
- conflict detection
- ad-hoc activities

Acceptance:

- user's complete day can be configured
- temporary changes do not alter base schedule
- effective schedule is deterministic

## Phase 6 — Activity Tracking

Build:

- start
- complete
- skip
- missed processing
- actual timing corrections
- daily summary

Acceptance:

- historical logs remain accurate
- duplicate/concurrent operations are safe

## Phase 7 — Notifications

Build:

- Redis
- BullMQ
- push subscriptions
- notification preferences
- alarm scheduling
- cancellation/rescheduling
- retry handling

Acceptance:

- configured activity reminders are scheduled
- schedule changes do not create stale duplicate reminders

## Phase 8 — Reports

Build:

- summary
- category report
- activity report
- daily trend
- weekly
- monthly
- custom range

Acceptance:

- reports are based on historical data
- user isolation is enforced
- empty ranges are handled correctly

## Phase 9 — Hardening

Complete:

- security tests
- authorization tests
- concurrency tests
- rate limiting
- logging
- monitoring
- database indexes
- query optimization
- dependency scan

## Phase 10 — Deployment

Complete:

- Docker
- CI/CD
- staging
- production environment
- migrations
- backups
- health checks
- monitoring
- worker deployment

# Definition of Done

A backend feature is done only when:

1. API contract is documented.
2. Input validation exists.
3. Authentication/authorization is enforced.
4. Ownership is verified.
5. Business logic is tested.
6. Negative scenarios are tested.
7. Database constraints are appropriate.
8. Errors use stable error codes.
9. Logs do not expose secrets.
10. TypeScript passes.
11. Lint passes.
12. Relevant unit/integration tests pass.
13. OpenAPI documentation is updated.
14. Migration is included when schema changes.
15. Performance is acceptable for expected load.

# MVP Boundary

The initial release must prioritize:

- authentication
- user-specific schedules
- activities/categories
- recurring schedule
- daily exceptions
- activity tracking
- alarms
- push notifications
- reports
- production-grade security

Do not add unrelated features such as social networking, public profiles, subscriptions, AI assistants, team management, or gamification until the core system is stable.
