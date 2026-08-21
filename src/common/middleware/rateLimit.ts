import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { env } from '../../config/env';
import { ErrorCode } from '../errors/errorCodes';

function rateLimitHandler(req: Request, res: Response): void {
  res.status(429).json({
    success: false,
    error: {
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests, please try again later',
    },
    requestId: req.requestId,
  });
}

export const generalRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_GENERAL_WINDOW_MS,
  max: env.RATE_LIMIT_GENERAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  skipSuccessfulRequests: false,
});
