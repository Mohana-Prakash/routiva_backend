# Backend Requirements — API Contracts & Validation

## 1. API Version

All application APIs should use:

    /api/v1

## 2. HTTP Methods

Use standard semantics:

- GET — read
- POST — create/action
- PATCH — partial update
- DELETE — delete/archive where appropriate

## 3. Status Codes

Use predictable status codes.

- 200 OK
- 201 Created
- 204 No Content
- 400 Bad Request
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- 409 Conflict
- 422 Unprocessable Entity
- 429 Too Many Requests
- 500 Internal Server Error
- 503 Service Unavailable

## 4. Validation

Validate every external input.

Validate:

- body
- query
- params
- headers where relevant

Use Zod or a consistent validation framework.

Reject unexpected malformed structures where appropriate.

## 5. Pagination

Collection endpoints should support:

- page/limit or cursor
- maximum page size

Never allow an unbounded request for potentially large datasets.

## 6. Filtering

Filtering should be explicit and validated.

Example:

    GET /activity-logs?from=...&to=...&status=COMPLETED

Do not concatenate raw query strings into SQL.

## 7. Sorting

Only allow a whitelist of sortable fields.

Never directly pass arbitrary user input into SQL ORDER BY clauses.

## 8. Error Codes

Use stable machine-readable codes.

Examples:

- VALIDATION_ERROR
- AUTH_REQUIRED
- INVALID_CREDENTIALS
- SESSION_EXPIRED
- RESOURCE_NOT_FOUND
- RESOURCE_FORBIDDEN
- SCHEDULE_CONFLICT
- DUPLICATE_RESOURCE
- RATE_LIMITED
- INTERNAL_ERROR

Frontend should rely on error codes rather than fragile message text.

## 9. API Endpoints

### Auth

    POST /auth/register
    POST /auth/login
    POST /auth/logout
    POST /auth/logout-all
    POST /auth/refresh
    POST /auth/forgot-password
    POST /auth/reset-password
    GET  /auth/me

### Users

    GET /users/me
    PATCH /users/me

### Categories

    GET /categories
    POST /categories
    PATCH /categories/:id
    DELETE /categories/:id

### Activities

    GET /activities
    POST /activities
    GET /activities/:id
    PATCH /activities/:id
    DELETE /activities/:id

### Schedules

    GET /schedules
    POST /schedules
    GET /schedules/:id
    PATCH /schedules/:id
    DELETE /schedules/:id
    GET /schedules/date/:date
    POST /schedules/exceptions
    PATCH /schedules/exceptions/:id
    DELETE /schedules/exceptions/:id

### Tracking

    GET /activity-logs
    GET /activity-logs/:id
    POST /activity-logs/:id/start
    POST /activity-logs/:id/complete
    POST /activity-logs/:id/skip
    PATCH /activity-logs/:id

### Notifications

    GET /notifications/preferences
    PATCH /notifications/preferences
    POST /notifications/push/subscribe
    DELETE /notifications/push/subscribe

### Reports

    GET /reports/summary
    GET /reports/categories
    GET /reports/activities
    GET /reports/daily-trend

## 10. OpenAPI

Every endpoint must document:

- authentication requirement
- request body
- parameters
- responses
- errors
- example payloads

## 11. API Contract Stability

Once an API is consumed by the frontend:

- avoid breaking changes
- add fields rather than unexpectedly removing fields
- use API versioning for breaking changes
