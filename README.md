# My Day Tracker — Backend

Production-grade REST API for a multi-user personal schedule, activity tracking, reminders, and
analytics platform. Built to satisfy the specs in [`backend-requirements/`](./backend-requirements).

Stack: Node.js 20, Express, TypeScript, PostgreSQL + Prisma, Redis + BullMQ, JWT auth with rotating
refresh sessions, Web Push, Zod, Pino, OpenAPI/Swagger, Jest + Supertest, Docker.

## Getting started (local development)

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d   # Postgres (dev + test) and Redis
npm install
npx prisma migrate dev
npm run dev            # API on http://localhost:4000
npm run worker:dev      # in a second terminal: notification + schedule-processing workers
```

- API docs: `http://localhost:4000/docs` (Swagger UI), raw spec at `/docs.json`.
- Health checks: `/health/live`, `/health/ready`.
- All application routes are under `/api/v1`.

## Testing

```bash
npm test          # Jest + Supertest against the isolated test Postgres (port 5433) and a
                   # dedicated Redis logical DB (index 2), configured via .env.test
npm run lint
npm run typecheck
```

`tests/globalSetup.ts` runs `prisma migrate deploy` against the test database before the suite
starts. Each integration test file truncates all tables in `afterEach` and closes DB/Redis/queue
connections in `afterAll`.

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
  the effective schedule *and* idempotently create `PLANNED` `activity_logs` rows for that single
  date, returning each occurrence's `activityLogId` so the frontend can immediately act on it via
  `POST /activity-logs/:id/start|complete|skip`. A background worker (`schedule-processing` queue,
  every 15 minutes) performs the same materialization for every active user's "yesterday" and
  "today" so reminders and missed-activity detection work even if the user never opens the app.
- **Notifications**: reminder jobs are keyed deterministically (`userId:occurrenceKey:offset`) so
  re-rendering a date never creates duplicate jobs. Quiet hours delay (rather than suppress)
  delivery. Permanently invalid push subscriptions (410/404 from the push service) are revoked and
  not retried; transient failures use BullMQ's exponential backoff.
- **Security posture**: ownership checks return `404` (not `403`) for resources that exist but
  belong to another user, to avoid confirming resource existence to an unauthorized caller.

## Docker

```bash
docker build -f docker/Dockerfile -t myday-tracker-service .
```

Multi-stage build, runs as a non-root user, and requires `openssl` on the Alpine runtime image for
Prisma's query engine. Run `node dist/server.js` for the API and `node dist/jobs/runWorkers.js` for
the background workers — deploy them as separate processes/containers in production.
