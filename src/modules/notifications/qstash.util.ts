import { Client, Receiver, SignatureError } from '@upstash/qstash';
import { env } from '../../config/env';
import { logger } from '../../common/logger';

let receiver: Receiver | null = null;
let client: Client | null = null;

/** Whether inbound QStash requests can actually be verified — both signing keys are required. */
export function isQStashVerificationConfigured(): boolean {
  return Boolean(env.QSTASH_CURRENT_SIGNING_KEY && env.QSTASH_NEXT_SIGNING_KEY);
}

function getReceiver(): Receiver {
  if (!receiver) {
    receiver = new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    });
  }
  return receiver;
}

/**
 * Verifies the `Upstash-Signature` header against the exact raw request body QStash sent.
 * Never throws for a bad/missing signature — returns false so callers uniformly respond 401
 * without leaking whether the failure was "no signature", "malformed", or "wrong key".
 */
export async function verifyQStashSignature(params: { signature: string | undefined; body: string; url: string }): Promise<boolean> {
  if (!isQStashVerificationConfigured()) {
    logger.error('QStash signature verification attempted without signing keys configured');
    return false;
  }
  if (!params.signature) return false;

  try {
    return await getReceiver().verify({ signature: params.signature, body: params.body, url: params.url });
  } catch (err) {
    if (err instanceof SignatureError) return false;
    throw err;
  }
}

/** Whether this process can originate new QStash messages/schedules (needs a token). */
export function isQStashPublishingConfigured(): boolean {
  return Boolean(env.QSTASH_TOKEN);
}

export function getQStashClient(): Client {
  if (!client) {
    if (!isQStashPublishingConfigured()) {
      throw new Error('QSTASH_TOKEN is not configured');
    }
    client = new Client({ token: env.QSTASH_TOKEN, baseUrl: env.QSTASH_URL || undefined });
  }
  return client;
}

/** This process's own public callback base, e.g. "https://routiva.onrender.com/api/v1". */
export function getApiBaseUrl(): string | null {
  return env.API_BASE_URL ? env.API_BASE_URL.replace(/\/+$/, '') : null;
}
