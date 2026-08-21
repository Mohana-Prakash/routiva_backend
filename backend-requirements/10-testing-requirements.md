# Backend Requirements — Testing Strategy

## 1. Testing Levels

Use:

- unit tests
- integration tests
- API tests
- database tests
- worker tests
- security tests
- negative tests
- concurrency tests where critical

## 2. Authentication Positive Tests

- register valid user
- login valid user
- refresh valid session
- logout
- logout all
- forgot password
- reset password
- access protected endpoint

## 3. Authentication Negative Tests

- duplicate email
- invalid email
- weak password
- wrong password
- missing credentials
- expired access token
- revoked refresh token
- reused refresh token
- malformed token
- suspended user
- excessive login attempts

## 4. Authorization Tests

Create two users.

Verify User A cannot:

- read User B's activities
- modify User B's activities
- read User B's schedules
- modify User B's schedules
- read User B's reports
- access User B's notification subscriptions
- access User B's activity logs

This is mandatory.

## 5. Schedule Positive Tests

- create daily activity
- create weekday activity
- create one-time activity
- retrieve effective daily schedule
- move activity for one date
- skip activity for one date
- add ad-hoc activity
- update recurring schedule
- archive activity

## 6. Schedule Negative Tests

- invalid start/end
- overlapping activity
- invalid recurrence
- invalid category
- unauthorized category
- unauthorized activity
- duplicate exception
- modification of historical data
- invalid timezone
- malformed date
- huge invalid input

## 7. Tracking Tests

Positive:

- start
- complete
- skip
- correct actual timing
- daily summary

Negative:

- start twice
- complete twice
- skip completed
- invalid timing
- unauthorized log
- concurrent completion

## 8. Notification Tests

- enable alarm
- disable alarm
- create push subscription
- multiple devices
- remove subscription
- schedule reminder
- move schedule and reschedule reminder
- disable alarm and cancel job
- invalid subscription cleanup
- retry transient provider failure

## 9. Report Tests

Test:

- today
- week
- month
- custom range
- empty range
- future range
- invalid range
- timezone boundary
- planned vs actual
- consistency
- category totals

## 10. API Validation Tests

For every major endpoint test:

- missing required fields
- wrong data types
- null values
- empty strings
- oversized strings
- invalid enum
- unknown fields if strict validation
- invalid IDs
- malformed dates
- malformed query parameters

## 11. Concurrency Tests

At minimum test:

- simultaneous completion
- simultaneous schedule update
- duplicate registration
- duplicate notification job creation

Expected outcome must be deterministic.

## 12. Integration Database

Use an isolated test PostgreSQL database.

Tests must not depend on production data.

Use migrations/schema setup as part of test preparation.

## 13. Redis/Worker Tests

Use isolated Redis test environment.

Verify:

- job creation
- processing
- retry
- failure
- duplicate prevention

## 14. Regression

Every production bug should result in a regression test when practical.

## 15. Coverage

Do not optimize only for a numeric coverage target.

Prioritize coverage of:

- authentication
- authorization
- ownership
- schedule calculations
- time boundaries
- tracking state transitions
- notification scheduling
- reports

## 16. Test Data

Factories/fixtures should generate users and domain entities safely.

Avoid sharing mutable global test data between tests.
