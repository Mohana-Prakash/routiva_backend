import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  createUser(data: { name: string; email: string; passwordHash: string; timezone: string }) {
    return prisma.user.create({ data });
  },

  updatePassword(userId: string, passwordHash: string) {
    return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  },

  touchLastLogin(userId: string) {
    return prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  },

  createRefreshSession(data: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }) {
    return prisma.refreshSession.create({ data });
  },

  findRefreshSessionByHash(tokenHash: string) {
    return prisma.refreshSession.findUnique({ where: { tokenHash } });
  },

  revokeRefreshSession(id: string) {
    return prisma.refreshSession.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  revokeRefreshSessionFamily(familyId: string) {
    return prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllRefreshSessionsForUser(userId: string) {
    return prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  touchRefreshSession(id: string) {
    return prisma.refreshSession.update({ where: { id }, data: { lastUsedAt: new Date() } });
  },

  createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.passwordResetToken.create({ data });
  },

  findPasswordResetTokenByHash(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  markPasswordResetTokenUsed(id: string) {
    return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
  },

  writeAuditLog(data: Prisma.AuditLogUncheckedCreateInput) {
    return prisma.auditLog.create({ data });
  },
};
