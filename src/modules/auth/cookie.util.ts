import { Response } from 'express';
import { env, isProduction } from '../../config/env';

/**
 * The frontend and backend are always deployed on different origins (e.g. a Netlify
 * static host and a Render API host), so auth cookies are inherently cross-site in
 * production. Browsers only send a cookie cross-site when it's SameSite=None, and
 * SameSite=None is rejected outright unless Secure is also set — so production can't
 * rely on REFRESH_COOKIE_SECURE/REFRESH_COOKIE_SAMESITE being configured correctly on
 * the host; getting either wrong silently breaks every session. Dev/test still honor
 * the env vars since localhost typically isn't served over HTTPS.
 *
 * Domain is forced unset (host-only) in production for the same reason: a Set-Cookie
 * whose Domain doesn't match the responding host is rejected outright by the browser,
 * so a leftover dev value like REFRESH_COOKIE_DOMAIN=localhost silently drops every
 * cookie rather than merely misbehaving.
 */
const cookieSecurity = isProduction
  ? { secure: true, sameSite: 'none' as const, domain: undefined }
  : {
      secure: env.REFRESH_COOKIE_SECURE,
      sameSite: env.REFRESH_COOKIE_SAMESITE,
      domain: env.REFRESH_COOKIE_DOMAIN || undefined,
    };

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(env.REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    ...cookieSecurity,
    path: '/api/v1/auth',
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(env.REFRESH_COOKIE_NAME, {
    httpOnly: true,
    ...cookieSecurity,
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
    ...cookieSecurity,
    path: '/',
    maxAge: env.JWT_ACCESS_TTL_MINUTES * 60 * 1000,
  });
}

export function clearAccessCookie(res: Response): void {
  res.clearCookie(env.ACCESS_COOKIE_NAME, {
    httpOnly: true,
    ...cookieSecurity,
    path: '/',
  });
}
