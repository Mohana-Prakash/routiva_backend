import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { usersRouter } from '../modules/users/users.routes';
import { categoriesRouter } from '../modules/categories/categories.routes';
import { activitiesRouter } from '../modules/activities/activities.routes';
import { schedulesRouter } from '../modules/schedules/schedules.routes';
import { trackingRouter } from '../modules/tracking/tracking.routes';
import { notificationsRouter } from '../modules/notifications/notifications.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { generalRateLimiter } from '../common/middleware/rateLimit';

export const apiRouter = Router();

apiRouter.use(generalRateLimiter);

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/activities', activitiesRouter);
apiRouter.use('/schedules', schedulesRouter);
apiRouter.use('/activity-logs', trackingRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/reports', reportsRouter);
