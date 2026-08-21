import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { authRateLimiter } from '../../common/middleware/rateLimit';
import { notificationsController } from './notifications.controller';
import { subscribeSchema, unsubscribeSchema, updatePreferencesSchema } from './notifications.validation';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth());

notificationsRouter.get('/preferences', asyncHandler(notificationsController.getPreferences));
notificationsRouter.patch(
  '/preferences',
  validate({ body: updatePreferencesSchema }),
  asyncHandler(notificationsController.updatePreferences),
);

notificationsRouter.post(
  '/push/subscribe',
  authRateLimiter,
  validate({ body: subscribeSchema }),
  asyncHandler(notificationsController.subscribe),
);
notificationsRouter.delete(
  '/push/subscribe',
  validate({ body: unsubscribeSchema }),
  asyncHandler(notificationsController.unsubscribe),
);
