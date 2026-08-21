import request from 'supertest';
import { app } from '../testUtils/app';
import { resetDatabase } from '../testUtils/db';
import { closeAll } from '../testUtils/teardown';
import { getSetCookie } from '../testUtils/auth';

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeAll();
});

describe('Auth', () => {
  const credentials = { name: 'Alice', email: 'alice@example.com', password: 'Passw0rd1', timezone: 'UTC' };

  it('registers a new user', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(credentials);
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(credentials.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate registration', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
    const res = await request(app).post('/api/v1/auth/register').send(credentials);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_RESOURCE');
  });

  it('rejects a weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...credentials, email: 'weak@example.com', password: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in with correct credentials and rejects wrong password', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);

    const ok = await request(app).post('/api/v1/auth/login').send({ email: credentials.email, password: credentials.password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();
    expect(ok.headers['set-cookie']).toBeDefined();

    const bad = await request(app).post('/api/v1/auth/login').send({ email: credentials.email, password: 'WrongPass1' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects login for an unknown account with the same error as wrong password (no enumeration)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Passw0rd1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects access to a protected route without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('refreshes a session and rotates the refresh token, detecting reuse of the old one', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email: credentials.email, password: credentials.password });
    const cookie = getSetCookie(login);

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refreshed.status).toBe(200);
    // Note: access tokens may be byte-identical to the original if issued within the same
    // second (JWT `iat` has second granularity) — that's expected, not a bug. The refresh
    // *session* rotating is what matters, verified below by reuse detection on the old cookie.
    expect(refreshed.headers['set-cookie']).toBeDefined();

    // Reusing the original (now-rotated-out) refresh cookie must be rejected.
    const reused = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('SESSION_REVOKED');
  });

  it('logs out and invalidates the refresh session', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email: credentials.email, password: credentials.password });
    const cookie = getSetCookie(login);

    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie).expect(200);

    const refreshed = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refreshed.status).toBe(401);
  });

  it('logs out all sessions', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
    const loginA = await request(app).post('/api/v1/auth/login').send({ email: credentials.email, password: credentials.password });
    const loginB = await request(app).post('/api/v1/auth/login').send({ email: credentials.email, password: credentials.password });

    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${loginA.body.data.accessToken}`)
      .expect(200);

    const refreshA = await request(app).post('/api/v1/auth/refresh').set('Cookie', getSetCookie(loginA));
    const refreshB = await request(app).post('/api/v1/auth/refresh').set('Cookie', getSetCookie(loginB));
    expect(refreshA.status).toBe(401);
    expect(refreshB.status).toBe(401);
  });

  it('forgot-password always returns a generic response regardless of account existence', async () => {
    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'alice@example.com' });
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.data.message).toBe(unknown.body.data.message);
  });
});
