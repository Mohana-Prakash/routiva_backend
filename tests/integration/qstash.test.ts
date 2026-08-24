import request from 'supertest';
import { createHash, createHmac } from 'crypto';
import { app } from '../testUtils/app';
import { registerAndLogin, authHeader } from '../testUtils/auth';

const CURRENT_KEY = 'test-current-signing-key-fixture';
const NEXT_KEY = 'test-next-signing-key-fixture';
const CALLBACK_URL = 'http://localhost:4001/api/v1/notifications/qstash/callback';

function bodyHash(body: string): string {
  return createHash('sha256').update(body).digest('base64url');
}

function base64url(input: object | string): string {
  const json = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(json).toString('base64url');
}

/**
 * Hand-rolled HS256 JWT matching the exact scheme QStash's Receiver verifies (see
 * node_modules/@upstash/qstash's Receiver.verifyWithKey / verifyBodyAndUrl): a JWT signed
 * with the signing key, `iss: "Upstash"`, `sub: <callback url>`, `body: base64url(sha256(raw
 * body))`. `jose` (the library the SDK itself uses) is ESM-only and doesn't load under this
 * project's CommonJS jest config, so this reimplements just the HS256 signing this test needs.
 */
function signFor(key: string, body: string, url = CALLBACK_URL): string {
  const header = base64url({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url({ iss: 'Upstash', sub: url, body: bodyHash(body), iat: now, exp: now + 300 });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', key).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

describe('QStash callback', () => {
  it('accepts a request signed with the current signing key', async () => {
    const body = JSON.stringify({ type: 'test', note: 'hello' });
    const signature = signFor(CURRENT_KEY, body);

    const res = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signature)
      .set('Upstash-Message-Id', 'msg-1')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.data.received).toBe(true);
    expect(res.body.data.messageId).toBe('msg-1');
  });

  it('accepts a request signed with the next signing key (key rotation support)', async () => {
    const body = JSON.stringify({ type: 'test' });
    const signature = signFor(NEXT_KEY, body);

    const res = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signature)
      .send(body);

    expect(res.status).toBe(200);
  });

  it('rejects a request with no signature header at all', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'test' }));

    expect(res.status).toBe(401);
  });

  it('rejects a request signed with the wrong key', async () => {
    const body = JSON.stringify({ type: 'test' });
    const signature = signFor('not-the-real-signing-key', body);

    const res = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signature)
      .send(body);

    expect(res.status).toBe(401);
  });

  it('rejects a request whose body was tampered with after signing', async () => {
    const signedBody = JSON.stringify({ type: 'test', amount: 1 });
    const signature = signFor(CURRENT_KEY, signedBody);
    const tamperedBody = JSON.stringify({ type: 'test', amount: 999 });

    const res = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signature)
      .send(tamperedBody);

    expect(res.status).toBe(401);
  });

  it('rejects a signature issued for a different URL', async () => {
    const body = JSON.stringify({ type: 'test' });
    const signature = signFor(CURRENT_KEY, body, 'http://localhost:4001/api/v1/some-other-endpoint');

    const res = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signature)
      .send(body);

    expect(res.status).toBe(401);
  });

  it('handles a redelivered (duplicate) message without erroring', async () => {
    const body = JSON.stringify({ type: 'test' });
    const signature = signFor(CURRENT_KEY, body);

    const first = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signature)
      .set('Upstash-Message-Id', 'msg-dup')
      .set('Upstash-Retried', '0')
      .send(body);
    const second = await request(app)
      .post('/api/v1/notifications/qstash/callback')
      .set('Content-Type', 'application/json')
      .set('Upstash-Signature', signature)
      .set('Upstash-Message-Id', 'msg-dup')
      .set('Upstash-Retried', '1')
      .send(body);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});

describe('QStash test-trigger', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/notifications/qstash/test-trigger').send({});
    expect(res.status).toBe(401);
  });

  it('refuses to run without a publishable QSTASH_TOKEN, without leaking whether the token is set', async () => {
    const user = await registerAndLogin();
    const res = await request(app).post('/api/v1/notifications/qstash/test-trigger').set(authHeader(user)).send({});
    // This test suite's fixture env has no real QSTASH_TOKEN, so publishing must be refused
    // cleanly (400) rather than attempting a real network call or crashing.
    expect(res.status).toBe(400);
  });
});
