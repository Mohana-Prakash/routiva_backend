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

/**
 * The access token is also delivered as an httpOnly cookie (in addition to the response
 * body) so that browser-based clients using a pure cookie-session architecture — never
 * touching the token in JS, always `withCredentials: true` — are authenticated without
 * needing to manage an Authorization header themselves. requireAuth() accepts either.
 * Path is root (not scoped to /auth) since every API route needs it.
 */
export function setAccessCookie(res: Response, token: string): void {
  res.cookie(env.ACCESS_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    domain: env.REFRESH_COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: env.JWT_ACCESS_TTL_MINUTES * 60 * 1000,
  });
}

export function clearAccessCookie(res: Response): void {
  res.clearCookie(env.ACCESS_COOKIE_NAME, {
    httpOnly: true,
    secure: env.REFRESH_COOKIE_SECURE,
    sameSite: env.REFRESH_COOKIE_SAMESITE,
    domain: env.REFRESH_COOKIE_DOMAIN || undefined,
    path: '/',
  });
}
