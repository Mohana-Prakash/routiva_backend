import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { AppError } from '../../common/errors/AppError';
import { logger } from '../../common/logger';
import { env, isProduction } from '../../config/env';
import { authRepository } from './auth.repository';
import { hashPassword, verifyPassword } from './password.util';
import { generateRefreshToken, hashToken, signAccessToken } from './token.util';
import type { LoginInput, RegisterInput } from './auth.validation';

interface RequestMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

// A fixed, never-matching hash used to equalize login timing when the account does not exist,
// mitigating trivial timing-based account enumeration.
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function toPublicUser(user: { id: string; name: string; email: string; timezone: string; status: string; createdAt: Date }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    status: user.status,
    createdAt: user.createdAt,
  };
}

async function issueTokens(userId: string, meta: RequestMeta, familyId: string = randomUUID()): Promise<AuthTokens> {
  const refreshToken = generateRefreshToken();
  const refreshTokenExpiresAt = DateTime.utc().plus({ days: env.JWT_REFRESH_TTL_DAYS }).toJSDate();

  await authRepository.createRefreshSession({
    userId,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: refreshTokenExpiresAt,
    userAgent: meta.userAgent,
    ipAddress: meta.ipAddress,
  });

  const accessToken = signAccessToken(userId);
  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

export const authService = {
  async register(input: RegisterInput, meta: RequestMeta) {
    const existing = await authRepository.findUserByEmail(input.email);
    if (existing) {
      // Registration intentionally reveals duplicate emails: standard UX tradeoff, distinct
      // from login/forgot-password which stay generic to avoid account enumeration there.
      throw AppError.duplicate('An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);
    const user = await authRepository.createUser({
      name: input.name,
      email: input.email,
      passwordHash,
      timezone: input.timezone,
    });

    await authRepository.writeAuditLog({ userId: user.id, action: 'USER_REGISTERED' });

    // Registration also establishes a session (auto-login): the frontend's cookie-session
    // architecture expects to be authenticated immediately after a successful register.
    const tokens = await issueTokens(user.id, meta);
    await authRepository.touchLastLogin(user.id);

    return { user: toPublicUser(user), tokens };
  },

  async login(input: LoginInput, meta: RequestMeta) {
    const user = await authRepository.findUserByEmail(input.email);

    // Still runs against a dummy hash when there's no user, so a missing-email response takes
    // the same time as a wrong-password one — this app deliberately distinguishes the two in
    // its error code/message (a personal, single-user app, so the usual enumeration concern
    // that pattern exists to prevent doesn't apply here), but there's no reason to give that up
    // for free via a timing side-channel too.
    const isValid = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, input.password);

    if (!user || !isValid) {
      await authRepository.writeAuditLog({
        userId: user?.id ?? null,
        action: 'LOGIN_FAILURE',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw user ? AppError.invalidCredentials() : AppError.emailNotFound();
    }

    if (user.status === 'SUSPENDED') {
      throw AppError.accountSuspended();
    }
    if (user.status === 'DELETED') {
      throw AppError.invalidCredentials();
    }

    const tokens = await issueTokens(user.id, meta);
    await authRepository.touchLastLogin(user.id);
    await authRepository.writeAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return { user: toPublicUser(user), tokens };
  },

  async refresh(refreshTokenPlain: string, meta: RequestMeta) {
    const tokenHash = hashToken(refreshTokenPlain);
    const session = await authRepository.findRefreshSessionByHash(tokenHash);

    if (!session) {
      throw AppError.sessionExpired('Refresh session not found');
    }

    if (session.revokedAt) {
      // Presenting an already-rotated/revoked refresh token indicates possible token theft.
      // Defensively revoke the entire session family.
      await authRepository.revokeRefreshSessionFamily(session.familyId);
      await authRepository.writeAuditLog({
        userId: session.userId,
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      throw AppError.sessionRevoked('Refresh session has been revoked');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw AppError.sessionExpired();
    }

    const user = await authRepository.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      throw AppError.authRequired('Account no longer available');
    }

    await authRepository.revokeRefreshSession(session.id);
    const tokens = await issueTokens(user.id, meta, session.familyId);

    return { user: toPublicUser(user), tokens };
  },

  async logout(refreshTokenPlain: string | undefined) {
    if (!refreshTokenPlain) return;
    const tokenHash = hashToken(refreshTokenPlain);
    const session = await authRepository.findRefreshSessionByHash(tokenHash);
    if (session && !session.revokedAt) {
      await authRepository.revokeRefreshSession(session.id);
      await authRepository.writeAuditLog({ userId: session.userId, action: 'LOGOUT' });
    }
  },

  async logoutAll(userId: string) {
    await authRepository.revokeAllRefreshSessionsForUser(userId);
    await authRepository.writeAuditLog({ userId, action: 'LOGOUT_ALL' });
  },

  async forgotPassword(email: string) {
    const user = await authRepository.findUserByEmail(email);
    if (user && user.status === 'ACTIVE') {
      const resetToken = generateRefreshToken();
      const expiresAt = DateTime.utc().plus({ hours: 1 }).toJSDate();
      await authRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash: hashToken(resetToken),
        expiresAt,
      });
      await authRepository.writeAuditLog({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED' });

      if (!isProduction) {
        // In production this would be dispatched via an email provider instead of logged.
        logger.info({ userId: user.id, resetToken }, 'Password reset token generated (dev only)');
      }
    }
    // Always return a generic outcome regardless of whether the account exists.
  },

  async resetPassword(tokenPlain: string, newPassword: string) {
    const tokenHash = hashToken(tokenPlain);
    const record = await authRepository.findPasswordResetTokenByHash(tokenHash);

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw AppError.validation('Reset token is invalid or expired');
    }

    const passwordHash = await hashPassword(newPassword);
    await authRepository.updatePassword(record.userId, passwordHash);
    await authRepository.markPasswordResetTokenUsed(record.id);
    await authRepository.revokeAllRefreshSessionsForUser(record.userId);
    await authRepository.writeAuditLog({ userId: record.userId, action: 'PASSWORD_CHANGED' });
  },

  async me(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw AppError.notFound('User not found');
    return toPublicUser(user);
  },
};
