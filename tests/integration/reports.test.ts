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

describe('Reports', () => {
  it('returns zeroed, non-crashing results for a range with no logs (0, not null, per the frontend contract)', async () => {
    const user = await registerAndLogin();
    const res = await request(app)
      .get('/api/v1/reports/summary?from=2030-01-01&to=2030-01-07')
      .set(authHeader(user))
      .expect(200);

    expect(res.body.data.completedCount).toBe(0);
    expect(res.body.data.completionRate).toBe(0);
    expect(res.body.data.totalPlannedMinutes).toBe(0);
  });

  it('rejects from after to', async () => {
    const user = await registerAndLogin();
    const res = await request(app).get('/api/v1/reports/summary?from=2030-01-10&to=2030-01-01').set(authHeader(user));
    expect(res.status).toBe(400);
  });

  it('rejects a range larger than the configured maximum', async () => {
    const user = await registerAndLogin();
    const res = await request(app).get('/api/v1/reports/summary?from=2000-01-01&to=2030-01-01').set(authHeader(user));
    expect(res.status).toBe(400);
  });

  it('accepts the timezone query param the frontend always sends', async () => {
    const user = await registerAndLogin();
    const res = await request(app)
      .get('/api/v1/reports/summary?from=2030-01-01&to=2030-01-07&timezone=Asia/Kolkata')
      .set(authHeader(user));
    expect(res.status).toBe(200);
  });

  it('reflects a completed activity in the summary and category breakdown', async () => {
    const user = await registerAndLogin();
    const category = await request(app).post('/api/v1/categories').set(authHeader(user)).send({ name: 'Spiritual', color: '#3366FF' }).expect(201);
    const activity = await request(app)
      .post('/api/v1/activities')
      .set(authHeader(user))
      .send({ name: 'Meditation', categoryId: category.body.data.id, alarmEnabled: false })
      .expect(201);
    await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activity.body.data.id, startTime: '00:00', endTime: '23:59', recurrence: { type: 'DAILY' } })
      .expect(201);

    const today = await request(app).get('/api/v1/schedules/today').set(authHeader(user)).expect(200);
    const logId = today.body.data.items[0].activityLog.id;
    await request(app).post(`/api/v1/activity-logs/${logId}/start`).set(authHeader(user)).expect(200);
    await request(app).post(`/api/v1/activity-logs/${logId}/complete`).set(authHeader(user)).expect(200);

    const date = today.body.data.date;
    const summary = await request(app).get(`/api/v1/reports/summary?from=${date}&to=${date}`).set(authHeader(user)).expect(200);
    expect(summary.body.data.completedCount).toBe(1);
    expect(summary.body.data.completionRate).toBe(100);

    const categories = await request(app)
      .get(`/api/v1/reports/categories?from=${date}&to=${date}`)
      .set(authHeader(user))
      .expect(200);
    expect(categories.body.data).toEqual([
      expect.objectContaining({ categoryName: 'Spiritual', categoryColor: '#3366FF', completionRate: 100 }),
    ]);
  });
});
