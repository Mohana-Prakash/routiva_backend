import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { verifyAccessToken } from '../../modules/auth/token.util';
import { prisma } from '../../db/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userTimezone?: string;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return null;
}

export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractBearerToken(req);
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
