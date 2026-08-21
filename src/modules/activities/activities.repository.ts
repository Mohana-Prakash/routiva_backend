import { prisma } from '../../db/prisma';
import type { CreateActivityInput, UpdateActivityInput } from './activities.validation';

export const activitiesRepository = {
  list(userId: string, includeInactive: boolean, categoryId?: string) {
    return prisma.activity.findMany({
      where: {
        userId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.activity.findFirst({ where: { id, userId }, include: { category: true } });
  },

  create(userId: string, data: CreateActivityInput) {
    return prisma.activity.create({
      data: {
        userId,
        name: data.name,
        categoryId: data.categoryId ?? null,
        description: data.description ?? null,
        defaultDurationMin: data.defaultDurationMinutes ?? null,
        alarmEnabled: data.alarmEnabled ?? false,
        alarmOffsetMinutes: data.alarmOffsetMinutes ?? 5,
      },
      include: { category: true },
    });
  },

  update(id: string, data: Partial<UpdateActivityInput>) {
    const { defaultDurationMinutes, ...rest } = data;
    return prisma.activity.update({
      where: { id },
      data: {
        ...rest,
        ...(defaultDurationMinutes !== undefined ? { defaultDurationMin: defaultDurationMinutes } : {}),
      },
      include: { category: true },
    });
  },

  archive(id: string) {
    return prisma.activity.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date() },
      include: { category: true },
    });
  },

  hasActiveSchedules(id: string) {
    return prisma.scheduleEntry.count({ where: { activityId: id, isActive: true } });
  },
};
