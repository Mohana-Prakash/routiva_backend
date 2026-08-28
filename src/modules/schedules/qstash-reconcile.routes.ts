import { Router } from 'express';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { qstashReconcileController } from './qstash-reconcile.controller';

export const qstashReconcileRouter = Router();

// No requireAuth() here — QStash calls this directly with a signature, not a logged-in user's
// JWT. Authorization is the signature check inside the controller.
qstashReconcileRouter.post('/reconcile', asyncHandler(qstashReconcileController.reconcile));
