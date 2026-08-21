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
    .send({ activityId: activity.body.data.activity.id, startTime: '00:00', endTime: '23:59', recurrenceType: 'DAILY' })
    .expect(201);
  const today = await request(app).get('/api/v1/schedules/today').set(authHeader(user)).expect(200);
  return today.body.data.timeline[0].activityLogId as string;
}

describe('Activity tracking', () => {
  it('starting twice is idempotent and returns the same IN_PROGRESS state', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const first = await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    const second = await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);

    expect(first.body.data.log.status).toBe('IN_PROGRESS');
    expect(second.body.data.log.status).toBe('IN_PROGRESS');
    expect(second.body.data.log.actualStart).toBe(first.body.data.log.actualStart);
  });

  it('rejects completing an activity that was never started', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    const res = await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('completing twice is idempotent', async () => {
    const user = await registerAndLogin();
    const logId = await setupTodayLog(user);

    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    const first = await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);
    const second = await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);

    expect(first.body.data.log.status).toBe('COMPLETED');
    expect(second.body.data.log.actualEnd).toBe(first.body.data.log.actualEnd);
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
    expect(a.body.data.log.status).toBe('COMPLETED');
    expect(b.body.data.log.status).toBe('COMPLETED');

    const fetched = await request(app).get(`/api/v1/activity-logs/${logId}`).set(authHeader(user)).expect(200);
    expect(fetched.body.data.log.status).toBe('COMPLETED');
  });
});
