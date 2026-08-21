import { Response } from 'express';
import { env } from '../../config/env';

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    domain: env.REFRESH_COOKIE_DOMAIN || undefined,
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    domain: env.REFRESH_COOKIE_DOMAIN || undefined,
    path: '/api/v1/auth',
  });
}
