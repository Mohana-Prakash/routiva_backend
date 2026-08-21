import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { trackingController } from './tracking.controller';
import {
  correctLogSchema,
  dailySummaryQuerySchema,
  listLogsQuerySchema,
  logIdParamSchema,
} from './tracking.validation';

export const trackingRouter = Router();

trackingRouter.use(requireAuth());

trackingRouter.get('/summary/daily', validate({ query: dailySummaryQuerySchema }), asyncHandler(trackingController.dailySummary));
trackingRouter.get('/', validate({ query: listLogsQuerySchema }), asyncHandler(trackingController.list));
trackingRouter.get('/:id', validate({ params: logIdParamSchema }), asyncHandler(trackingController.get));
trackingRouter.post('/:id/start', validate({ params: logIdParamSchema }), asyncHandler(trackingController.start));
trackingRouter.post('/:id/complete', validate({ params: logIdParamSchema }), asyncHandler(trackingController.complete));
trackingRouter.post('/:id/skip', validate({ params: logIdParamSchema }), asyncHandler(trackingController.skip));
trackingRouter.patch(
  '/:id',
  validate({ params: logIdParamSchema, body: correctLogSchema }),
  asyncHandler(trackingController.correct),
);
