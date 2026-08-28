import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { qstashController } from './qstash.controller';
import { qstashTestTriggerSchema } from './qstash.validation';

export const qstashRouter = Router();

// No requireAuth() here — QStash calls this directly with a signature, not a logged-in
// user's JWT. Authorization is the signature check inside the controller.
qstashRouter.post('/callback', asyncHandler(qstashController.callback));

// Real alarm delivery — same signature-only auth as /callback above.
qstashRouter.post('/deliver', asyncHandler(qstashController.deliver));

// Authenticated: only a logged-in user can originate a test round trip (keeps this from being
// an open trigger anyone on the internet could hit to burn QStash's free-tier quota).
qstashRouter.post(
  '/test-trigger',
  requireAuth(),
  validate({ body: qstashTestTriggerSchema }),
  asyncHandler(qstashController.testTrigger),
);
