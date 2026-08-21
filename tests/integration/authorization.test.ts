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

describe('Cross-user authorization', () => {
  it('prevents user B from reading, modifying, or acting on user A resources', async () => {
    const userA = await registerAndLogin();
    const userB = await registerAndLogin();

    const category = await request(app)
      .post('/api/v1/categories')
      .set(authHeader(userA))
      .send({ name: 'Spiritual', color: '#3366FF' })
      .expect(201);

    const activity = await request(app)
      .post('/api/v1/activities')
      .set(authHeader(userA))
      .send({ name: 'Meditation', categoryId: category.body.data.id })
      .expect(201);

    const schedule = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(userA))
      .send({ activityId: activity.body.data.id, startTime: '04:00', endTime: '04:30', recurrence: { type: 'DAILY' } })
      .expect(201);

    // Materialize a log for user A via the render endpoint.
    const rendered = await request(app).get('/api/v1/schedules/today').set(authHeader(userA)).expect(200);
    const logId = rendered.body.data.items[0]?.activityLog?.id;

    // User B must not be able to read or modify any of user A's resources.
    await request(app).get(`/api/v1/activities/${activity.body.data.id}`).set(authHeader(userB)).expect(404);
    await request(app)
      .patch(`/api/v1/activities/${activity.body.data.id}`)
      .set(authHeader(userB))
      .send({ name: 'Hijacked' })
      .expect(404);

    await request(app).get(`/api/v1/schedules/${schedule.body.data.id}`).set(authHeader(userB)).expect(404);
    await request(app)
      .patch(`/api/v1/schedules/${schedule.body.data.id}`)
      .set(authHeader(userB))
      .send({ startTime: '05:00' })
      .expect(404);

    if (logId) {
      await request(app).get(`/api/v1/activity-logs/${logId}`).set(authHeader(userB)).expect(404);
      await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(userB)).expect(404);
    }

    // Reports must never leak across users: user B's own reports must not include user A's data.
    const today = new Date().toISOString().slice(0, 10);
    const reportB = await request(app)
      .get(`/api/v1/reports/summary?from=${today}&to=${today}`)
      .set(authHeader(userB))
      .expect(200);
    expect(reportB.body.data.completedCount).toBe(0);

    // Notification preferences are also user-scoped: changing user A's must not affect user B's.
    await request(app)
      .post('/api/v1/notifications/push/subscribe')
      .set(authHeader(userA))
      .send({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } })
      .expect(201);

    await request(app)
      .patch('/api/v1/notifications/preferences')
      .set(authHeader(userA))
      .send({ quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '06:00' })
      .expect(200);

    const prefsB = await request(app).get('/api/v1/notifications/preferences').set(authHeader(userB)).expect(200);
    expect(prefsB.body.data.quietHoursEnabled).toBe(false);
  });
});
