# Personal Schedule & Activity Tracker — Backend Requirements

Production-grade backend requirements for a multi-user scheduling, activity tracking, reminders, and analytics platform.

## Backend Stack

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ
- JWT-based authentication with secure HTTP-only cookies where applicable
- Web Push for browser/PWA notifications
- Zod for request validation
- Pino for structured logging
- OpenAPI/Swagger
- Jest + Supertest
- Docker

## Requirement Documents

1. `01-architecture-and-principles.md` — architecture, boundaries, production principles
2. `02-database-and-data-model.md` — PostgreSQL schema and data integrity
3. `03-authentication-and-authorization.md` — registration, login, sessions, password reset, security
4. `04-schedule-and-activity-domain.md` — schedules, recurrence, activities, exceptions, conflicts
5. `05-tracking-and-time-logging.md` — planned vs actual tracking and immutable history
6. `06-notifications-and-background-jobs.md` — alarms, push subscriptions, Redis/BullMQ
7. `07-reports-and-analytics.md` — weekly, monthly, custom reports
8. `08-api-contracts-and-validation.md` — REST API conventions and validation
9. `09-error-handling-security-and-observability.md` — security, errors, logging, monitoring
10. `10-testing-requirements.md` — positive, negative, edge, integration and security tests
11. `11-production-deployment-and-operations.md` — Docker, CI/CD, migrations, backups, scaling
12. `12-implementation-plan-and-definition-of-done.md` — implementation sequence and acceptance criteria

## Core Product Rule

The backend must separate:

- recurring/base schedule
- date-specific schedule exceptions
- actual activity history

Changing today's schedule must never silently rewrite historical records.

## Development Rule

Do not invent behavior that conflicts with these requirements. When an implementation detail is ambiguous, prefer:

1. data integrity
2. user isolation
3. security
4. predictable API behavior
5. backward compatibility
6. operational simplicity
