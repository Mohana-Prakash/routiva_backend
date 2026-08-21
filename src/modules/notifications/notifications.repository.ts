import { NotificationJobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export const notificationsRepository = {
  upsertSubscription(userId: string, data: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
    return prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: { ...data, userId },
      update: { userId, p256dh: data.p256dh, auth: data.auth, userAgent: data.userAgent, revokedAt: null, lastUsedAt: new Date() },
    });
  },

  findActiveSubscriptionsForUser(userId: string) {
    return prisma.pushSubscription.findMany({ where: { userId, revokedAt: null } });
  },

  findSubscriptionByEndpointForUser(endpoint: string, userId: string) {
    return prisma.pushSubscription.findFirst({ where: { endpoint, userId } });
  },

  revokeSubscription(id: string) {
    return prisma.pushSubscription.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  revokeSubscriptionByEndpoint(endpoint: string) {
    return prisma.pushSubscription.updateMany({ where: { endpoint }, data: { revokedAt: new Date() } });
  },

  async getOrCreatePreferences(userId: string) {
    const existing = await prisma.notificationPreference.findUnique({ where: { userId } });
    if (existing) return existing;
    return prisma.notificationPreference.create({ data: { userId } });
  },

  updatePreferences(userId: string, data: Prisma.NotificationPreferenceUpdateInput) {
    return prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...(data as Record<string, unknown>) },
      update: data,
    });
  },

  findJobByKey(jobKey: string) {
    return prisma.notificationJob.findUnique({ where: { jobKey } });
  },

  upsertJob(data: { userId: string; activityLogId: string | null; jobKey: string; scheduledAt: Date }) {
    return prisma.notificationJob.upsert({
      where: { jobKey: data.jobKey },
      create: { ...data, status: NotificationJobStatus.SCHEDULED },
      update: { scheduledAt: data.scheduledAt, status: NotificationJobStatus.SCHEDULED, failureReason: null },
    });
  },

  markSent(id: string) {
    return prisma.notificationJob.update({ where: { id }, data: { status: NotificationJobStatus.SENT, sentAt: new Date() } });
  },

  markFailed(id: string, reason: string, attempts: number) {
    return prisma.notificationJob.update({
      where: { id },
      data: { status: NotificationJobStatus.FAILED, failureReason: reason.slice(0, 500), attempts },
    });
  },

  cancelJob(id: string) {
    return prisma.notificationJob.update({ where: { id }, data: { status: NotificationJobStatus.CANCELLED } });
  },

  cancelJobsForActivityLogIds(activityLogIds: string[]) {
    if (activityLogIds.length === 0) return Promise.resolve({ count: 0 });
    return prisma.notificationJob.updateMany({
      where: { activityLogId: { in: activityLogIds }, status: NotificationJobStatus.SCHEDULED },
      data: { status: NotificationJobStatus.CANCELLED },
    });
  },

  findDueJobs(beforeUtc: Date) {
    return prisma.notificationJob.findMany({
      where: { status: NotificationJobStatus.SCHEDULED, scheduledAt: { lte: beforeUtc } },
      include: { activityLog: true },
    });
  },
};
