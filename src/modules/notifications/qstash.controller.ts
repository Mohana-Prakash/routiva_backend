import { Request, Response } from 'express';
import { AppError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';
import { sendSuccess } from '../../common/utils/response';
import { getApiBaseUrl, getQStashClient, isQStashPublishingConfigured, verifyQStashSignature } from './qstash.util';
import type { QStashTestTriggerInput } from './qstash.validation';

export const qstashController = {
  /**
   * PoC/test callback QStash delivers to. Auth is the signature alone (not JWT — QStash is
   * the caller, not a logged-in user), verified over the exact raw body bytes captured by
   * app.ts's express.json `verify` hook. Never trust this route without that check passing.
   */
  async callback(req: Request, res: Response): Promise<void> {
    const signature = req.headers['upstash-signature'] as string | undefined;
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const url = `${getApiBaseUrl() ?? ''}/notifications/qstash/callback`;

    const valid = await verifyQStashSignature({ signature, body: rawBody, url });
    if (!valid) {
      // Deliberately generic: never reveal *why* verification failed to an unauthenticated caller.
      throw AppError.authRequired('Invalid or missing QStash signature');
    }

    const messageId = req.headers['upstash-message-id'] as string | undefined;
    const retried = req.headers['upstash-retried'] as string | undefined;
    logger.info({ messageId, retried, body: req.body }, 'QStash callback verified and received');

    // Real alarm delivery (Phase 3+) will look up the referenced activity log here, re-check
    // it's still due/active/not-already-sent (see notificationWorker.ts's existing idempotency
    // guard on NotificationJob.status), and send the push — using messageId as an additional
    // dedupe key against retried deliveries. This PoC only proves the verified round trip.
    sendSuccess(res, { received: true, messageId: messageId ?? null, echo: req.body });
  },

  /**
   * Authenticated (logged-in dev, not QStash) trigger that originates a real QStash message
   * back to this same callback, to prove the full round trip: our API -> QStash -> our API.
   * Requires API_BASE_URL (a publicly reachable HTTPS URL) since QStash cannot reach localhost.
   */
  async testTrigger(req: Request, res: Response): Promise<void> {
    const input = req.body as QStashTestTriggerInput;
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      throw AppError.validation(
        'API_BASE_URL is not configured — QStash cannot reach a local machine. Set it to a public HTTPS URL (the deployed Render URL, or a tunnel) to test the live round trip.',
      );
    }
    if (!isQStashPublishingConfigured()) {
      throw AppError.validation('QSTASH_TOKEN is not configured');
    }

    const callbackUrl = `${baseUrl}/notifications/qstash/callback`;
    const result = await getQStashClient().publishJSON({
      url: callbackUrl,
      body: { type: 'test', note: input.note ?? null, triggeredBy: req.userId, triggeredAt: new Date().toISOString() },
      delay: 5,
    });

    logger.info({ messageId: result.messageId, callbackUrl }, 'QStash test message published');
    sendSuccess(res, { messageId: result.messageId, callbackUrl, delaySeconds: 5 }, 201);
  },
};
