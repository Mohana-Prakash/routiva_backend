import request from 'supertest';
import type { Server } from 'http';
import { createHash, createHmac } from 'crypto';
import { app } from '../testUtils/app';
import { resetDatabase } from '../testUtils/db';
import { closeAll } from '../testUtils/teardown';
import { authHeader, registerAndLogin, type TestUser } from '../testUtils/auth';
import { prisma } from '../../src/db/prisma';

// Same fixture keys as .env.test / qstash.test.ts.
const CURRENT_KEY = 'test-current-signing-key-fixture';

let server: Server;
let deliverUrl: string;

beforeAll((done) => {
  server = app.listen(0, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    deliverUrl = `http://127.0.0.1:${port}/api/v1/notifications/qstash/deliver`;
    done();
  });
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeAll();
});

function bodyHash(body: string): string {
  return createHash('sha256').update(body).digest('base64url');
}

function base64url(input: object | string): string {
  const json = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(json).toString('base64url');
}

// Mirrors qstash.test.ts's signFor — see that file's doc comment for why this is hand-rolled.
function signFor(key: string, body: string, url?: string): string {
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url({ iss: 'Upstash', sub: url ?? deliverUrl, body: bodyHash(body), iat: now, exp: now + 300 });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', key).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

function post(body: object, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  return request(server)
    .post('/api/v1/notifications/qstash/deliver')
    .set('Content-Type', 'application/json')
    .set('Upstash-Signature', signFor(CURRENT_KEY, json))
    .set(headers)
    .send(json);
}

/** A real activity + daily schedule entry + materialized today's PLANNED log, via the real API. */
async function setupTodayLog(user: TestUser) {
  const activity = await request(app).post('/api/v1/activities').set(authHeader(user)).send({ name: 'Study' }).expect(201);
  await request(app)
    .post('/api/v1/schedules')
    .set(authHeader(user))
    .send({ activityId: activity.body.data.id, startTime: '00:00', endTime: '23:59', recurrence: { type: 'DAILY' } })
    .expect(201);
  const today = await request(app).get('/api/v1/schedules/today').set(authHeader(user)).expect(200);
  return today.body.data.items[0].activityLog.id as string;
}

/** Seeds a SCHEDULED NotificationJob directly — the scheduling side (which creates this row)
 *  is covered separately by tests/unit/notification-scheduler.qstash.test.ts; this file is
 *  only about what happens once QStash calls the delivery callback for one. */
async function seedNotificationJob(user: TestUser, activityLogId: string, overrides: Partial<{ kind: string }> = {}) {
  const job = await prisma.notificationJob.create({
    data: {
      userId: user.userId,
      activityLogId,
      jobKey: `test:${activityLogId}:${overrides.kind ?? 'timed-actionable'}`,
      scheduledAt: new Date(),
      status: 'SCHEDULED',
    },
  });
  return job.id;
}

describe('QStash reminder delivery', () => {
  it('rejects an invalid signature and leaves the job untouched', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    const jobId = await seedNotificationJob(user, logId);

    const body = { notificationJobId: jobId, userId: user.userId, activityLogId: logId, activityName: 'Study', kind: 'timed-actionable', actions: ['start', 'skip'] };
    const res = await request(server)
      .post('/api/v1/notifications/qstash/deliver')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signFor('wrong-key', JSON.stringify(body)))
      .send(JSON.stringify(body));

    expect(res.status).toBe(401);
    const row = await prisma.notificationJob.findUnique({ where: { id: jobId } });
    expect(row?.status).toBe('SCHEDULED');
  });

  it('is idempotent: redelivering the same message after it resolved does nothing further', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    // No push subscription registered -> resolves via the "nothing to deliver to" path,
    // which is itself a clean, non-throwing terminal outcome (FAILED, not retried).
    const jobId = await seedNotificationJob(user, logId);
    const body = { notificationJobId: jobId, userId: user.userId, activityLogId: logId, activityName: 'Study', kind: 'timed-actionable', actions: ['start', 'skip'] };

    const first = await post(body, { 'Upstash-Message-Id': 'msg-1', 'Upstash-Retried': '0' });
    expect(first.status).toBe(200);
    const afterFirst = await prisma.notificationJob.findUnique({ where: { id: jobId } });
    expect(afterFirst?.status).toBe('FAILED');
    const failedAt = afterFirst?.updatedAt.getTime();

    // A redelivery (QStash retried, or delivered the same message twice) must be a safe no-op —
    // the job is no longer SCHEDULED, so deliverReminder's idempotency guard short-circuits.
    const second = await post(body, { 'Upstash-Message-Id': 'msg-1', 'Upstash-Retried': '1' });
    expect(second.status).toBe(200);
    const afterSecond = await prisma.notificationJob.findUnique({ where: { id: jobId } });
    expect(afterSecond?.status).toBe('FAILED');
    expect(afterSecond?.updatedAt.getTime()).toBe(failedAt); // untouched a second time, not re-processed
  });

  it('an end-check for an already-resolved log finds nothing to say and marks itself sent without attempting a push', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);
    const jobId = await seedNotificationJob(user, logId, { kind: 'end-check' });

    const res = await post(
      { notificationJobId: jobId, userId: user.userId, activityLogId: logId, activityName: 'Study', kind: 'end-check', actions: [] },
    );

    expect(res.status).toBe(200);
    const row = await prisma.notificationJob.findUnique({ where: { id: jobId } });
    expect(row?.status).toBe('SENT');
  });

  it('a transient failure on a non-final attempt responds non-2xx (so QStash retries) without marking the job failed yet', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    // A subscription exists, so delivery is actually attempted — VAPID keys are unset in the
    // test env (.env.test), so the send itself fails transiently, exactly like a real transient
    // push-service outage would.
    await prisma.pushSubscription.create({
      data: { userId: user.userId, endpoint: 'https://push.example.test/1', p256dh: 'p', auth: 'a' },
    });
    const jobId = await seedNotificationJob(user, logId);
    const body = { notificationJobId: jobId, userId: user.userId, activityLogId: logId, activityName: 'Study', kind: 'timed-actionable', actions: ['start', 'skip'] };

    const res = await post(body, { 'Upstash-Retried': '0' });

    expect(res.status).toBeGreaterThanOrEqual(500);
    const row = await prisma.notificationJob.findUnique({ where: { id: jobId } });
    expect(row?.status).toBe('SCHEDULED'); // not given up on yet
  });

  it('a transient failure on the final attempt marks the job failed and acknowledges 200 (stops QStash retrying further)', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await prisma.pushSubscription.create({
      data: { userId: user.userId, endpoint: 'https://push.example.test/2', p256dh: 'p', auth: 'a' },
    });
    const jobId = await seedNotificationJob(user, logId);
    const body = { notificationJobId: jobId, userId: user.userId, activityLogId: logId, activityName: 'Study', kind: 'timed-actionable', actions: ['start', 'skip'] };

    const res = await post(body, { 'Upstash-Retried': '3' });

    expect(res.status).toBe(200);
    expect(res.body.data.delivered).toBe(false);
    expect(res.body.data.terminal).toBe(true);
    const row = await prisma.notificationJob.findUnique({ where: { id: jobId } });
    expect(row?.status).toBe('FAILED');
    expect(row?.attempts).toBe(4);
  });

  it('cancelling via the real complete action flips a QStash-scheduled job to CANCELLED', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    const jobId = await seedNotificationJob(user, logId);
    // Simulates a job that was scheduled via QStash (has a stored message id) — cancellation
    // must succeed at the DB level regardless of whether the QStash-side delete also runs
    // (it's skipped here since QSTASH_TOKEN is unset in the test env — see notification-scheduler.ts).
    await prisma.notificationJob.update({ where: { id: jobId }, data: { qstashMessageId: 'msg-would-be-deleted' } });

    await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);

    const row = await prisma.notificationJob.findUnique({ where: { id: jobId } });
    expect(row?.status).toBe('CANCELLED');
  });
});
