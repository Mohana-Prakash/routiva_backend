import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { schedulesController } from './schedules.controller';
import {
  createExceptionSchema,
  createScheduleEntrySchema,
  dateParamSchema,
  exceptionIdParamSchema,
  listSchedulesQuerySchema,
  scheduleIdParamSchema,
  updateExceptionSchema,
  updateScheduleEntrySchema,
} from './schedules.validation';

export const schedulesRouter = Router();

schedulesRouter.use(requireAuth());

schedulesRouter.get('/', validate({ query: listSchedulesQuerySchema }), asyncHandler(schedulesController.list));
schedulesRouter.post('/', validate({ body: createScheduleEntrySchema }), asyncHandler(schedulesController.create));

schedulesRouter.get('/today', asyncHandler(schedulesController.today));
schedulesRouter.get('/date/:date', validate({ params: dateParamSchema }), asyncHandler(schedulesController.renderForDate));

schedulesRouter.post('/exceptions', validate({ body: createExceptionSchema }), asyncHandler(schedulesController.createException));
schedulesRouter.patch(
  '/exceptions/:id',
  validate({ params: exceptionIdParamSchema, body: updateExceptionSchema }),
  asyncHandler(schedulesController.updateException),
);
schedulesRouter.delete(
  '/exceptions/:id',
  validate({ params: exceptionIdParamSchema }),
  asyncHandler(schedulesController.deleteException),
);

schedulesRouter.get('/:id', validate({ params: scheduleIdParamSchema }), asyncHandler(schedulesController.get));
schedulesRouter.patch(
  '/:id',
  validate({ params: scheduleIdParamSchema, body: updateScheduleEntrySchema }),
  asyncHandler(schedulesController.update),
);
schedulesRouter.delete('/:id', validate({ params: scheduleIdParamSchema }), asyncHandler(schedulesController.remove));
