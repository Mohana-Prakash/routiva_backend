import { Request, Response } from 'express';
import { AppError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';
import { sendSuccess } from '../../common/utils/response';
import { notificationsRepository } from './notifications.repository';
import { deliverReminder } from './reminder-delivery';
import { getApiBaseUrl, getQStashClient, isQStashPublishingConfigured, verifyQStashSignature } from './qstash.util';
import { reminderDeliverSchema, type QStashTestTriggerInput } from './qstash.validation';

/** Matches the `retries` set when publishing in notification-scheduler.ts's
 *  scheduleStageViaQStash — used to tell "this attempt failed, but QStash will retry" apart
 *  from "this was the last attempt, give up and record it". */
const QSTASH_MAX_RETRIES = 3;

export const qstashController = {
  /**
   * PoC/test callback QStash delivers to. Auth is the signature alone (not JWT — QStash is
   * the caller, not a logged-in user), verified over the exact raw body bytes captured by
   * app.ts's express.json `verify` hook. Never trust this route without that check passing.
   */
  async callback(req: Request, res: Response): Promise<void> {
    const signature = req.headers['upstash-signature'] as string | undefined;
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    // QStash signs the exact URL it was told to deliver to, so verification must check against
    // the request as it actually arrived — not a value reconstructed from API_BASE_URL, which
    // can silently drift from reality (e.g. unset on the deployed host) and would then reject
    // every real delivery. `trust proxy` (app.ts) makes req.protocol/host proxy-aware.
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = await verifyQStashSignature({ signature, body: rawBody, url });
    if (!valid) {
      // Deliberately generic: never reveal *why* verification failed to an unauthenticated caller.
      throw AppError.authRequired('Invalid or missing QStash signature');
    }

    const messageId = req.headers['upstash-message-id'] as string | undefined;
    const retried = req.headers['upstash-retried'] as string | undefined;
    logger.info({ messageId, retried, body: req.body }, 'QStash callback verified and received');

    // Real alarm delivery now happens via the `deliver` handler below — this route is kept only
    // as the original signature-verification proof-of-concept / manual test round trip.
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

  /**
   * Real alarm delivery callback — QStash calls this at the exact time notification-scheduler.ts
   * published for. Auth is the signature alone, same as `callback` above.
   */
  async deliver(req: Request, res: Response): Promise<void> {
    const signature = req.headers['upstash-signature'] as string | undefined;
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = await verifyQStashSignature({ signature, body: rawBody, url });
    if (!valid) {
      throw AppError.authRequired('Invalid or missing QStash signature');
    }

    const payload = reminderDeliverSchema.parse(req.body);
    const retried = Number(req.headers['upstash-retried'] ?? 0);
    const isLastAttempt = retried >= QSTASH_MAX_RETRIES;

    try {
      await deliverReminder(payload);
      sendSuccess(res, { delivered: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown delivery error';
      logger.error({ err, notificationJobId: payload.notificationJobId, retried, isLastAttempt }, 'QStash reminder delivery failed');

      if (!isLastAttempt) {
        // Re-throw so this responds non-2xx and QStash retries per its own backoff — do NOT
        // mark the job FAILED yet, it may still succeed on a later attempt.
        throw err;
      }

      // Retries exhausted: record the terminal failure ourselves and acknowledge with 200 —
      // no point having QStash keep retrying (or route to its DLQ) a state we've already
      // resolved on our side.
      await notificationsRepository
        .markFailed(payload.notificationJobId, message, retried + 1)
        .catch((e) => logger.error({ err: e }, 'Failed to persist notification failure'));
      sendSuccess(res, { delivered: false, terminal: true });
    }
  },
};
