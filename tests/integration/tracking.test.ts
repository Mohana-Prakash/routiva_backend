import request from 'supertest';
import { app } from '../testUtils/app';
import { resetDatabase } from '../testUtils/db';
import { closeAll } from '../testUtils/teardown';
import { authHeader, registerAndLogin } from '../testUtils/auth';
import { prisma } from '../../src/db/prisma';

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAll();
});

async function setupTodayLog(user: Awaited<ReturnType<typeof registerAndLogin>>) {
  const activity = await request(app).post('/api/v1/activities').set(authHeader(user)).send({ name: 'Study' }).expect(201);
  await request(app)
    .post('/api/v1/schedules')
    .set(authHeader(user))
    .send({ activityId: activity.body.data.id, startTime: '00:00', endTime: '23:59', recurrence: { type: 'DAILY' } })
    .expect(201);
  const today = await request(app).get('/api/v1/schedules/today').set(authHeader(user)).expect(200);
  return today.body.data.items[0].activityLog.id as string;
}

describe('Activity tracking', () => {
  it('starting twice is idempotent and returns the same IN_PROGRESS state', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const first = await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    const second = await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);

    expect(first.body.data.status).toBe('IN_PROGRESS');
    expect(second.body.data.status).toBe('IN_PROGRESS');
    expect(second.body.data.actualStart).toBe(first.body.data.actualStart);
  });

  it('completing an activity that was never started is a one-tap complete: backfills actualStart to now', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.actualStart).toBe(res.body.data.actualEnd);
  });

  it('completing twice is idempotent', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    const first = await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);
    const second = await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);

    expect(first.body.data.status).toBe('COMPLETED');
    expect(second.body.data.actualEnd).toBe(first.body.data.actualEnd);
  });

  it('rejects skipping a completed activity', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/skip`).set(authHeader(user));
    expect(res.status).toBe(422);
  });

  it('handles two near-simultaneous completion requests without duplicating state', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);

    const [a, b] = await Promise.all([
      request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)),
      request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.data.status).toBe('COMPLETED');
    expect(b.body.data.status).toBe('COMPLETED');

    const fetched = await request(app).get(`/api/v1/activity-logs/${logId}`).set(authHeader(user)).expect(200);
    expect(fetched.body.data.status).toBe('COMPLETED');
  });

  it('completing with an explicit actual duration uses the provided actualStart/actualEnd, not "now"', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const actualStart = new Date(Date.now() - 15 * 60_000).toISOString();
    const actualEnd = new Date().toISOString();
    const res = await request(app)
      .post(`/api/v1/activity-logs/${logId}/complete`)
      .set(authHeader(user))
      .send({ actualStart, actualEnd })
      .expect(200);

    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.actualStart).toBe(actualStart);
    expect(res.body.data.actualEnd).toBe(actualEnd);
  });

  it('rejects completing with actualEnd before actualStart', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const res = await request(app)
      .post(`/api/v1/activity-logs/${logId}/complete`)
      .set(authHeader(user))
      .send({ actualStart: new Date().toISOString(), actualEnd: new Date(Date.now() - 60_000).toISOString() });

    expect(res.status).toBe(400);
  });

  it('a MISSED log — the window passed with no action taken — can still be completed', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await prisma.activityLog.update({ where: { id: logId }, data: { status: 'MISSED' } });

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);
    expect(res.body.data.status).toBe('COMPLETED');
  });

  it('rejects skipping a MISSED log — Missed is already the "not done" label, Skip adds nothing', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await prisma.activityLog.update({ where: { id: logId }, data: { status: 'MISSED' } });

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/skip`).set(authHeader(user));
    expect(res.status).toBe(422);

    const stillMissed = await request(app).get(`/api/v1/activity-logs/${logId}`).set(authHeader(user)).expect(200);
    expect(stillMissed.body.data.status).toBe('MISSED');
  });

  it('rejects skipping an in-progress activity whose planned window has already closed — complete it instead', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    await prisma.activityLog.update({ where: { id: logId }, data: { plannedEnd: new Date(Date.now() - 60_000) } });

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/skip`).set(authHeader(user));
    expect(res.status).toBe(422);

    const stillInProgress = await request(app).get(`/api/v1/activity-logs/${logId}`).set(authHeader(user)).expect(200);
    expect(stillInProgress.body.data.status).toBe('IN_PROGRESS');
  });

  it('marks an abandoned in-progress activity as missed once its window has closed', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    await prisma.activityLog.update({ where: { id: logId }, data: { plannedEnd: new Date(Date.now() - 60_000) } });

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/miss`).set(authHeader(user)).expect(200);
    expect(res.body.data.status).toBe('MISSED');
  });

  it('rejects marking an in-progress activity as missed while its window is still open', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/miss`).set(authHeader(user));
    expect(res.status).toBe(422);
  });

  it('rejects marking a never-started (PLANNED) activity as missed — that is the sweep\'s job', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/miss`).set(authHeader(user));
    expect(res.status).toBe(422);
  });
});

describe('Reclassifying an already-resolved activity log', () => {
  it('correcting Completed to Skipped clears the actual minutes and completedAt', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);

    const res = await request(app)
      .patch(`/api/v1/activity-logs/${logId}/status`)
      .set(authHeader(user))
      .send({ status: 'SKIPPED' })
      .expect(200);

    expect(res.body.data.status).toBe('SKIPPED');
    expect(res.body.data.actualStart).toBeNull();
    expect(res.body.data.actualEnd).toBeNull();
    expect(res.body.data.completedAt).toBeNull();
  });

  it('correcting Skipped to Completed with explicit actuals uses them', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/skip`).set(authHeader(user)).expect(200);

    const actualStart = new Date(Date.now() - 15 * 60_000).toISOString();
    const actualEnd = new Date().toISOString();
    const res = await request(app)
      .patch(`/api/v1/activity-logs/${logId}/status`)
      .set(authHeader(user))
      .send({ status: 'COMPLETED', actualStart, actualEnd })
      .expect(200);

    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.actualStart).toBe(actualStart);
    expect(res.body.data.actualEnd).toBe(actualEnd);
    expect(res.body.data.completedAt).not.toBeNull();
  });

  it('correcting Skipped to Completed without actuals falls back to the planned window', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/skip`).set(authHeader(user)).expect(200);

    const res = await request(app)
      .patch(`/api/v1/activity-logs/${logId}/status`)
      .set(authHeader(user))
      .send({ status: 'COMPLETED' })
      .expect(200);

    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.actualStart).not.toBeNull();
    expect(res.body.data.actualEnd).not.toBeNull();
  });

  it('rejects reclassifying a still-live (PLANNED/IN_PROGRESS) log — use start/complete/skip instead', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const res = await request(app)
      .patch(`/api/v1/activity-logs/${logId}/status`)
      .set(authHeader(user))
      .send({ status: 'SKIPPED' });

    expect(res.status).toBe(422);
  });

  it('rejects actualStart/actualEnd on a non-Completed target', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);
    await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);

    const res = await request(app)
      .patch(`/api/v1/activity-logs/${logId}/status`)
      .set(authHeader(user))
      .send({ status: 'SKIPPED', actualStart: new Date().toISOString(), actualEnd: new Date().toISOString() });

    expect(res.status).toBe(400);
  });
});
