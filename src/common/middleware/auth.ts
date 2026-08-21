import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../../modules/auth/token.util';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userTimezone?: string;
    }
  }
}

/**
 * Supports two client architectures: an Authorization header (API/mobile clients that
 * manage the token themselves) or an httpOnly access-token cookie (browser clients using
 * a pure cookie-session model, which never touch the token in JS). Header takes priority.
 */
function extractAccessToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const cookieToken = req.cookies?.[env.ACCESS_COOKIE_NAME] as string | undefined;
  return cookieToken ?? null;
}

export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractAccessToken(req);
      if (!token) {
        throw AppError.authRequired();
      }

      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch {
        throw AppError.sessionExpired('Access token is invalid or expired');
      }

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) {
        throw AppError.authRequired('User no longer exists');
      }
      if (user.status === 'SUSPENDED') {
        throw AppError.accountSuspended();
      }
      if (user.status === 'DELETED') {
        throw AppError.authRequired('Account no longer available');
      }

      req.userId = user.id;
      req.userTimezone = user.timezone;
      next();
    } catch (err) {
      next(err);
    }
  };
}
