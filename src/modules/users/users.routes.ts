import { Router } from 'express';
import { requireAuth } from '../../common/middleware/auth';
import { validate } from '../../common/middleware/validate';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { usersController } from './users.controller';
import { updateProfileSchema } from './users.validation';

export const usersRouter = Router();

usersRouter.use(requireAuth());
usersRouter.get('/me', asyncHandler(usersController.getMe));
usersRouter.patch('/me', validate({ body: updateProfileSchema }), asyncHandler(usersController.updateMe));
