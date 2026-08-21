# Backend Requirements — Architecture & Principles

## 1. Goal

Build a production-grade REST API for a multi-user personal schedule and activity tracking application.

The backend must support thousands of users without requiring architectural changes for the initial scale.

## 2. Architecture

Use a modular Express.js architecture.

Recommended:

    src/
      app.ts
      server.ts
      config/
      common/
        middleware/
        errors/
        logger/
        utils/
      modules/
        auth/
        users/
        categories/
        activities/
        schedules/
        tracking/
        notifications/
        reports/
      jobs/
        workers/
        queues/
      db/
      routes/
      docs/

Each domain module should separate:

- route/controller layer
- validation layer
- service/business layer
- repository/data-access layer
- types

Controllers must remain thin.

Business rules belong in services.

Database access must not be scattered through route handlers.

## 3. API Style

Use RESTful JSON APIs.

Version APIs:

    /api/v1/...

Return predictable response envelopes.

Success example:

    {
      "success": true,
      "data": {...},
      "meta": {...}
    }

Error example:

    {
      "success": false,
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid request",
        "details": [...]
      },
      "requestId": "..."
    }

## 4. Configuration

All environment-specific values must come from environment variables.

Never hard-code:

- database passwords
- JWT secrets
- push notification keys
- Redis credentials
- SMTP credentials
- production URLs

Validate environment variables at startup.

Fail fast if required configuration is missing.

## 5. User Isolation

Every user-owned resource must be scoped by authenticated user ID.

Never trust a client-provided `userId`.

The server must derive ownership from the authenticated session/token.

## 6. Transactions

Use database transactions when a business operation changes multiple related records.

Examples:

- Completing an activity and creating its log
- Deleting a category with dependent active schedules
- Creating schedule exceptions
- Changing recurring schedules while preserving history

## 7. Idempotency

Important mutating operations should be safe against accidental retries.

Consider idempotency keys for:

- activity completion
- notification subscription creation
- complex schedule mutations

Repeated requests must not create duplicate business records.

## 8. Concurrency

The backend must handle two requests arriving at nearly the same time.

Examples:

- Two devices completing the same activity
- Updating the same schedule
- Creating overlapping exceptions
- Registering the same email

Use unique constraints, transactions, and appropriate locking where necessary.

## 9. Time

Store timestamps in UTC.

Store user timezone separately.

Daily schedule times must be interpreted using the user's configured timezone.

Do not use server local time for user scheduling decisions.

## 10. Soft Delete

Prefer soft deletion/deactivation for entities with historical references.

Historical activity logs must remain available after an activity is archived/deactivated.

## 11. Security Baseline

Use:

- Helmet
- CORS allowlist
- Rate limiting
- Request body size limits
- Input validation
- Parameter validation
- Secure cookies where applicable
- Password hashing
- Security headers
- Audit logging for security-sensitive operations

## 12. Health Endpoints

Provide:

- `/health/live`
- `/health/ready`

Readiness should verify required dependencies such as PostgreSQL and Redis.

## 13. Graceful Shutdown

On SIGTERM/SIGINT:

- stop accepting new requests
- finish safe in-flight work
- stop job workers
- close Redis
- close database connections
- exit cleanly

## 14. Documentation

Publish OpenAPI documentation for every public API.

Document:

- request schema
- response schema
- authentication
- errors
- status codes
- examples

## 15. No Business Logic in Middleware

Middleware should handle cross-cutting concerns only.

Business decisions belong in domain services.
