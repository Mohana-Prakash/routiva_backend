import request from 'supertest';
import { app } from '../testUtils/app';
import { resetDatabase } from '../testUtils/db';
import { closeAll } from '../testUtils/teardown';
import { authHeader, registerAndLogin, TestUser } from '../testUtils/auth';

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAll();
});

async function createActivity(user: TestUser, name: string) {
  const res = await request(app).post('/api/v1/activities').set(authHeader(user)).send({ name }).expect(201);
  return res.body.data.id as string;
}

describe('Schedule engine', () => {
  it('creates a daily schedule and renders it for a future date', async () => {
    const user = await registerAndLogin();
    const activityId = await createActivity(user, 'Meditation');

    await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId, startTime: '04:00', endTime: '04:30', recurrence: { type: 'DAILY' } })
      .expect(201);

    const rendered = await request(app).get('/api/v1/schedules/date/2030-06-15').set(authHeader(user)).expect(200);
    expect(rendered.body.data.items).toHaveLength(1);
    expect(rendered.body.data.items[0].activityId).toBe(activityId);
    expect(rendered.body.data.items[0].activityLog).not.toBeNull();
    expect(rendered.body.data.items[0].activityLog.status).toBe('PLANNED');
  });

  it('rejects overlapping schedule entries with 409 SCHEDULE_CONFLICT, and allows override', async () => {
    const user = await registerAndLogin();
    const activityA = await createActivity(user, 'Meditation');
    const activityB = await createActivity(user, 'Murli');

    await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activityA, startTime: '04:00', endTime: '05:00', recurrence: { type: 'DAILY' } })
      .expect(201);

    const conflict = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activityB, startTime: '04:30', endTime: '05:30', recurrence: { type: 'DAILY' } });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('SCHEDULE_CONFLICT');
    expect(conflict.body.error.details.conflicts).toHaveLength(1);
    expect(conflict.body.error.details.conflicts[0].activityName).toBe('Meditation');

    const overridden = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activityB, startTime: '04:30', endTime: '05:30', recurrence: { type: 'DAILY' }, override: true });
    expect(overridden.status).toBe(201);
  });

  it('resolves a conflict when the frontend sends a conflict-resolution choice instead of override', async () => {
    const user = await registerAndLogin();
    const activityA = await createActivity(user, 'Meditation');
    const activityB = await createActivity(user, 'Murli');

    await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activityA, startTime: '04:00', endTime: '05:00', recurrence: { type: 'DAILY' } })
      .expect(201);

    const resolved = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activityB, startTime: '04:30', endTime: '05:30', recurrence: { type: 'DAILY' }, resolution: 'KEEP_BOTH' });
    expect(resolved.status).toBe(201);
  });

  it('rejects invalid time ranges and unauthorized activity references', async () => {
    const user = await registerAndLogin();
    const activityId = await createActivity(user, 'Meditation');

    const sameTime = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId, startTime: '04:00', endTime: '04:00', recurrence: { type: 'DAILY' } });
    expect(sameTime.status).toBe(400);

    const otherUser = await registerAndLogin();
    const foreignActivity = await createActivity(otherUser, 'Not yours');
    const unauthorized = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: foreignActivity, startTime: '06:00', endTime: '06:30', recurrence: { type: 'DAILY' } });
    expect(unauthorized.status).toBe(400);
  });

  it('applies a MOVE exception for a single date without altering the base schedule', async () => {
    const user = await registerAndLogin();
    const activityId = await createActivity(user, 'Study');

    const entry = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId, startTime: '07:30', endTime: '08:45', recurrence: { type: 'DAILY' } })
      .expect(201);

    await request(app)
      .post('/api/v1/schedules/exceptions')
      .set(authHeader(user))
      .send({
        sourceScheduleEntryId: entry.body.data.id,
        activityId,
        date: '2030-06-20',
        startTime: '09:00',
        endTime: '10:00',
        action: 'MOVE',
      })
      .expect(201);

    const movedDay = await request(app).get('/api/v1/schedules/date/2030-06-20').set(authHeader(user)).expect(200);
    expect(movedDay.body.data.items[0].startTime).toBe('09:00');

    const normalDay = await request(app).get('/api/v1/schedules/date/2030-06-21').set(authHeader(user)).expect(200);
    expect(normalDay.body.data.items[0].startTime).toBe('07:30');
  });

  it('rejects a duplicate exception for the same source entry and date', async () => {
    const user = await registerAndLogin();
    const activityId = await createActivity(user, 'Study');

    const entry = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId, startTime: '07:30', endTime: '08:45', recurrence: { type: 'DAILY' } })
      .expect(201);

    const payload = {
      sourceScheduleEntryId: entry.body.data.id,
      activityId,
      date: '2030-06-20',
      startTime: '09:00',
      endTime: '10:00',
      action: 'MOVE',
    };
    await request(app).post('/api/v1/schedules/exceptions').set(authHeader(user)).send(payload).expect(201);
    const dup = await request(app).post('/api/v1/schedules/exceptions').set(authHeader(user)).send(payload);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_RESOURCE');
  });

  it('flags overlapping same-day items with hasConflict/conflictsWithIds', async () => {
    const user = await registerAndLogin();
    const activityA = await createActivity(user, 'Meditation');
    const activityB = await createActivity(user, 'Murli');

    await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activityA, startTime: '04:00', endTime: '05:00', recurrence: { type: 'DAILY' } })
      .expect(201);
    await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId: activityB, startTime: '04:30', endTime: '05:30', recurrence: { type: 'DAILY' }, override: true })
      .expect(201);

    const rendered = await request(app).get('/api/v1/schedules/date/2030-06-15').set(authHeader(user)).expect(200);
    expect(rendered.body.data.items).toHaveLength(2);
    for (const item of rendered.body.data.items) {
      expect(item.hasConflict).toBe(true);
      expect(item.conflictsWithIds).toHaveLength(1);
    }
  });

  it('updates a schedule entry with the frontend scope enum and no explicit effective date', async () => {
    const user = await registerAndLogin();
    const activityId = await createActivity(user, 'Study');

    const entry = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId, startTime: '07:30', endTime: '08:45', recurrence: { type: 'DAILY' } })
      .expect(201);

    const updated = await request(app)
      .patch(`/api/v1/schedules/${entry.body.data.id}`)
      .set(authHeader(user))
      .send({ startTime: '08:00', endTime: '09:00', scope: 'THIS_AND_FUTURE' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.startTime).toBe('08:00');
  });

  it('deletes (archives) a schedule entry using the frontend delete-scope query param', async () => {
    const user = await registerAndLogin();
    const activityId = await createActivity(user, 'Study');

    const entry = await request(app)
      .post('/api/v1/schedules')
      .set(authHeader(user))
      .send({ activityId, startTime: '07:30', endTime: '08:45', recurrence: { type: 'DAILY' } })
      .expect(201);

    const removed = await request(app)
      .delete(`/api/v1/schedules/${entry.body.data.id}`)
      .query({ scope: 'ENTIRE_RULE' })
      .set(authHeader(user));
    expect(removed.status).toBe(204);
  });
});
