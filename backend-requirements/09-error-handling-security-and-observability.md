# Backend Requirements — Error Handling, Security & Observability

## 1. Global Error Handler

Express must have one final error-handling middleware.

Expected behavior:

- known operational errors → controlled response
- validation errors → 4xx
- unknown errors → generic 500
- no stack traces returned in production

## 2. Request IDs

Every request should receive a request ID.

Return it in response headers and include it in logs.

Example:

    X-Request-ID

## 3. Structured Logging

Use structured JSON logs.

Include:

- timestamp
- level
- requestId
- route
- method
- status
- duration
- userId when available
- error code

Never log:

- passwords
- access tokens
- refresh tokens
- reset tokens
- push authentication secrets

## 4. Security Middleware

Use:

- Helmet
- CORS allowlist
- rate limiting
- body size limits
- compression where appropriate
- strict input validation

## 5. Rate Limiting

Apply stronger limits to:

- login
- registration
- password reset
- refresh
- notification subscription

General authenticated APIs can have a different limit.

## 6. CORS

Do not use:

    Access-Control-Allow-Origin: *

in production when credentials are involved.

Use explicit allowed origins.

## 7. SQL Injection

Use Prisma parameterized queries.

Do not construct raw SQL from untrusted input.

If raw SQL is necessary, parameterize it.

## 8. ID Enumeration

Even with UUIDs, always enforce ownership.

Do not depend on IDs being unpredictable for authorization.

## 9. Sensitive Data

Minimize storage of:

- IP addresses
- user agents
- notification payloads

If retained, document retention and purpose.

## 10. Audit

Audit security-sensitive changes.

Also consider auditing:

- recurring schedule changes
- schedule exception changes
- account changes

## 11. Monitoring

Production should monitor:

- API error rate
- latency
- database errors
- Redis errors
- worker failures
- notification delivery failures
- queue depth

## 12. Health Checks

Liveness must not fail merely because a dependency is temporarily unavailable.

Readiness should indicate dependency health.

## 13. Error Response Security

Do not reveal:

- database errors
- SQL statements
- filesystem paths
- stack traces
- secrets

## 14. Abuse Prevention

Protect against:

- brute-force login
- password reset abuse
- request flooding
- oversized payloads
- notification subscription abuse

## 15. Data Access Security

Every repository method receiving a user-owned resource ID should require user scope where applicable.

Avoid generic repository methods that make accidental cross-user queries easy.
