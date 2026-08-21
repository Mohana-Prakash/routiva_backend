import webpush from 'web-push';
import { env } from '../../config/env';
import { logger } from '../../common/logger';

let configured = false;

function ensureConfigured(): boolean {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return false;
  }
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushSendResult = { ok: true } | { ok: false; permanent: boolean; error: string };

export async function sendPushNotification(target: PushTarget, payload: Record<string, unknown>): Promise<PushSendResult> {
  if (!ensureConfigured()) {
    return { ok: false, permanent: false, error: 'VAPID keys are not configured' };
  }

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    const permanent = statusCode === 404 || statusCode === 410;
    const message = err instanceof Error ? err.message : 'Unknown push error';
    if (!permanent) {
      logger.warn({ err, endpoint: target.endpoint }, 'Transient push notification failure');
    }
    return { ok: false, permanent, error: message };
  }
}
