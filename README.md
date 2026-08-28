# Routiva — Backend

Production-grade REST API for a multi-user personal schedule, activity tracking, reminders, and
analytics platform. Built to satisfy the specs in [`backend-requirements/`](./backend-requirements).

Stack: Node.js 20, Express, TypeScript, PostgreSQL + Prisma, QStash (Upstash) for reminder
delivery and schedule reconciliation, JWT auth with rotating refresh sessions, Web Push, Zod,
Pino, OpenAPI/Swagger, Jest + Supertest, Docker.

## Getting started (local development)

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d   # Postgres (dev + test)
npm install
npx prisma migrate dev
npm run dev            # API on http://localhost:4000
```

QStash can't reach `localhost`, so reminder scheduling and schedule reconciliation both silently
no-op in local dev unless `API_BASE_URL` points at a publicly reachable tunnel (see `.env.example`).

- API docs: `http://localhost:4000/docs` (Swagger UI), raw spec at `/docs.json`.
- Health checks: `/health/live`, `/health/ready`.
- All application routes are under `/api/v1`.

## Testing

```bash
npm test          # Jest + Supertest against the isolated test Postgres (port 5433),
                   # configured via .env.test
npm run lint
npm run typecheck
```

`tests/globalSetup.ts` runs `prisma migrate deploy` against the test database before the suite
starts. Each integration test file truncates all tables in `afterEach` and closes the database
connection in `afterAll`.

## Route naming vs. the frontend

The canonical route names implemented here follow `backend-requirements/08-api-contracts-and-validation.md`
(e.g. `GET /reports/categories`, `GET /reports/daily-trend`). The sibling `my_day_tracker_web`
frontend spec references a couple of alternate names (`/reports/category`, `/reports/daily`); this
service also exposes `GET /schedules/today` as a convenience alias since it's a trivial wrapper
around `GET /schedules/date/:date` with the date resolved server-side from the user's timezone.

## Architecture notes

- **Schedule engine**: recurring definitions (`schedule_entries`) and date-specific
  `schedule_exceptions` are stored separately and merged at read time by a pure function
  (`schedule-renderer.ts`) into a deterministic per-date timeline. `activity_logs` are the
  immutable historical record — editing a recurring schedule never rewrites already-materialized
  logs; it only prunes not-yet-acted-upon `PLANNED` placeholders so they regenerate from the new
  definition on next render.
- **Tracking materialization**: `GET /schedules/date/:date` (and `/schedules/today`) both render
  the effective schedule _and_ idempotently create `PLANNED` `activity_logs` rows for that single
  date, returning each occurrence's `activityLogId` so the frontend can immediately act on it via
  `POST /activity-logs/:id/start|complete|skip`. A QStash schedule (`jobs/scheduler.ts`, every 10
  minutes) calls `POST /qstash/reconcile` to perform the same materialization for every active
  user's "yesterday" and "today", so reminders and missed-activity detection work even if the
  user never opens the app.
- **Notifications**: no worker process — QStash calls `POST /notifications/qstash/deliver`
  directly at each reminder's exact scheduled time (`notification-scheduler.ts` publishes the
  message; `reminder-delivery.ts` does the actual send). Reminder jobs are keyed deterministically
  (`userId:occurrenceKey:offset`) so re-rendering a date never creates duplicate jobs. Quiet hours
  delay (rather than suppress) delivery. Permanently invalid push subscriptions (410/404 from the
  push service) are revoked and not retried; transient failures use QStash's own retry/backoff,
  configured per message.
- **Security posture**: ownership checks return `404` (not `403`) for resources that exist but
  belong to another user, to avoid confirming resource existence to an unauthorized caller.

## Docker

```bash
docker build -f docker/Dockerfile -t myday-tracker-service .
```

Multi-stage build, runs as a non-root user, and requires `openssl` on the Alpine runtime image for
Prisma's query engine. `node dist/server.js` runs the whole API — there's no separate worker
process to deploy; QStash calls back into this same service for both reminders and schedule
reconciliation.
