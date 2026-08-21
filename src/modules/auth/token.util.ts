import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { env } from '../../config/env';

export interface AccessTokenPayload {
  sub: string; // user id
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.JWT_ACCESS_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === 'string' || !decoded.sub) {
    throw new Error('Malformed token payload');
  }
  return { sub: decoded.sub as string };
}

/** Opaque, high-entropy refresh token. Only its hash is persisted. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
