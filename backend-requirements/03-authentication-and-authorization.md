# Backend Requirements — Authentication & Authorization

## 1. Registration

Endpoint concept:

    POST /api/v1/auth/register

Request:

- name
- email
- password
- timezone

Positive cases:

- valid new email
- valid password
- valid timezone

Negative cases:

- missing email
- malformed email
- duplicate email
- missing password
- weak password
- invalid timezone
- oversized fields
- unexpected fields where strict validation is enabled

Do not reveal sensitive information through duplicate-email responses if that would enable account enumeration. Use an intentional product/security policy.

## 2. Password Security

Use Argon2id or a strong bcrypt configuration.

Never:

- log passwords
- return password hashes
- store plaintext passwords
- send passwords by email

## 3. Login

Endpoint concept:

    POST /api/v1/auth/login

Positive:

- correct credentials

Negative:

- wrong password
- unknown account
- missing fields
- malformed email
- excessive attempts
- disabled account

Use rate limiting and account abuse protection.

Avoid response messages that make account enumeration trivial.

## 4. Access Tokens

Use short-lived access tokens.

Include only necessary claims:

- subject/user ID
- issued-at
- expiry
- token identifier where needed

Do not place sensitive profile data in tokens.

## 5. Refresh Sessions

Use rotating refresh sessions where practical.

Requirements:

- expiration
- revocation
- reuse detection where implemented
- logout
- logout all sessions
- session listing if supported

## 6. Cookie Security

If using cookies:

- HttpOnly
- Secure in production
- SameSite configured intentionally
- appropriate domain/path

Implement CSRF protection when required by the cookie architecture.

## 7. Logout

Support:

    POST /api/v1/auth/logout

Logout should invalidate the current refresh session.

Optional:

    POST /api/v1/auth/logout-all

## 8. Forgot Password

Flow:

1. User submits email.
2. Backend always returns a generic response.
3. Generate single-use expiring reset token.
4. Send reset link.
5. User sets new password.
6. Invalidate relevant sessions.

Negative cases:

- expired token
- already-used token
- malformed token
- weak new password
- mismatched password confirmation

## 9. Authorization

Current product is primarily user-scoped.

Every protected endpoint must verify:

1. authentication
2. ownership

Never authorize based only on a URL resource ID.

Example:

    GET /activities/:id

must query:

    activity.id = :id
    AND activity.user_id = authenticatedUserId

## 10. Account Status

Support account states such as:

- ACTIVE
- SUSPENDED
- DELETED

Suspended users must not access protected functionality.

## 11. Security Events

Record useful security events without secrets:

- login success
- login failure
- password reset requested
- password changed
- logout
- session revoked

## 12. Authentication Test Scenarios

Must test:

- valid registration
- duplicate registration
- invalid credentials
- expired access token
- revoked refresh session
- refresh token reuse
- logout
- logout-all
- password reset
- unauthorized resource access
- cross-user resource access
- rate-limit behavior
