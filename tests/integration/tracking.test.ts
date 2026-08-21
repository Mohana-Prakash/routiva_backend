import request from 'supertest';
import { app } from '../testUtils/app';
import { resetDatabase } from '../testUtils/db';
import { closeAll } from '../testUtils/teardown';
import { authHeader, registerAndLogin } from '../testUtils/auth';

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
});
