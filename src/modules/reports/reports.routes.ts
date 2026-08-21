import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { reportsController } from './reports.controller';
import { reportRangeQuerySchema } from './reports.validation';

export const reportsRouter = Router();

reportsRouter.use(requireAuth());
reportsRouter.use(validate({ query: reportRangeQuerySchema }));

reportsRouter.get('/summary', asyncHandler(reportsController.summary));
reportsRouter.get('/categories', asyncHandler(reportsController.categories));
reportsRouter.get('/activities', asyncHandler(reportsController.activities));
reportsRouter.get('/daily-trend', asyncHandler(reportsController.dailyTrend));
