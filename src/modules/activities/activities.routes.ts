import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { activitiesController } from './activities.controller';
import {
  activityIdParamSchema,
  createActivitySchema,
  listActivitiesQuerySchema,
  updateActivitySchema,
} from './activities.validation';

export const activitiesRouter = Router();

activitiesRouter.use(requireAuth());

activitiesRouter.get('/', validate({ query: listActivitiesQuerySchema }), asyncHandler(activitiesController.list));
activitiesRouter.post('/', validate({ body: createActivitySchema }), asyncHandler(activitiesController.create));
activitiesRouter.get('/:id', validate({ params: activityIdParamSchema }), asyncHandler(activitiesController.get));
activitiesRouter.patch(
  '/:id',
  validate({ params: activityIdParamSchema, body: updateActivitySchema }),
  asyncHandler(activitiesController.update),
);
activitiesRouter.delete('/:id', validate({ params: activityIdParamSchema }), asyncHandler(activitiesController.remove));
