import { Router } from 'express';
import { authController } from './auth.controller';
import { validate } from '../../common/middleware/validate';
import { requireAuth } from '../../common/middleware/auth';
import { authRateLimiter } from '../../common/middleware/rateLimit';
import { asyncHandler } from '../../common/utils/asyncHandler';
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.validation';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validate({ body: registerSchema }), asyncHandler(authController.register));
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), asyncHandler(authController.login));
authRouter.post('/refresh', authRateLimiter, asyncHandler(authController.refresh));
authRouter.post('/logout', asyncHandler(authController.logout));
authRouter.post('/logout-all', requireAuth(), asyncHandler(authController.logoutAll));
authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(authController.forgotPassword),
);
authRouter.post(
  '/reset-password',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(authController.resetPassword),
);
authRouter.get('/me', requireAuth(), asyncHandler(authController.me));
