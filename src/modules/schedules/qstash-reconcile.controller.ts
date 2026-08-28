import { Request, Response } from 'express';
import { AppError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';
import { sendSuccess } from '../../common/utils/response';
import { verifyQStashSignature } from '../../common/qstash/qstash.util';
import { reconcileAllUsers } from './reconcile.service';

export const qstashReconcileController = {
  /**
   * QStash calls this every 10 minutes (see jobs/scheduler.ts's schedule registration). Auth is
   * the signature alone, same pattern as the reminder delivery callback
   * (modules/notifications/qstash.controller.ts) — QStash is the caller, not a logged-in user.
   */
  async reconcile(req: Request, res: Response): Promise<void> {
    const signature = req.headers['upstash-signature'] as string | undefined;
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const valid = await verifyQStashSignature({ signature, body: rawBody, url });
    if (!valid) {
      throw AppError.authRequired('Invalid or missing QStash signature');
    }

    await reconcileAllUsers();
    logger.debug('Schedule reconciliation completed');
    sendSuccess(res, { reconciled: true });
  },
};
