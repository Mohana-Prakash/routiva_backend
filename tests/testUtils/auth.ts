import request from 'supertest';
import { app } from './app';

export interface TestUser {
  email: string;
  password: string;
  name: string;
  timezone: string;
  accessToken: string;
  userId: string;
  cookie: string;
}

let counter = 0;

export async function registerAndLogin(overrides: Partial<{ name: string; timezone: string }> = {}): Promise<TestUser> {
  counter += 1;
  const email = `user${counter}-${Date.now()}@example.com`;
  const password = 'Passw0rd1';
  const name = overrides.name ?? `Test User ${counter}`;
  const timezone = overrides.timezone ?? 'Asia/Kolkata';

  await request(app).post('/api/v1/auth/register').send({ name, email, password, timezone }).expect(201);

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);

  const cookie = loginRes.headers['set-cookie']?.[0] ?? '';

  return {
    email,
    password,
    name,
    timezone,
    accessToken: loginRes.body.data.accessToken,
    userId: loginRes.body.data.user.id,
    cookie,
  };
}

export function authHeader(user: TestUser): { Authorization: string } {
  return { Authorization: `Bearer ${user.accessToken}` };
}

export function getSetCookie(res: request.Response): string {
  const cookie = res.headers['set-cookie']?.[0];
  if (!cookie) throw new Error('Expected a Set-Cookie header on the response');
  return cookie;
}
