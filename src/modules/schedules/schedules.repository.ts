import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

const entryInclude = {
  activity: {
    select: {
      id: true,
      name: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      alarmEnabled: true,
      alarmOffsetMinutes: true,
      isActive: true,
    },
  },
} as const;

const exceptionInclude = {
  activity: {
    select: {
      id: true,
      name: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      alarmEnabled: true,
      alarmOffsetMinutes: true,
    },
  },
} as const;

export const schedulesRepository = {
  listEntriesForUser(userId: string, includeInactive: boolean) {
    return prisma.scheduleEntry.findMany({
      where: { userId, ...(includeInactive ? {} : { isActive: true }) },
      include: entryInclude,
      orderBy: { startTime: 'asc' },
    });
  },

  findEntryForUser(id: string, userId: string) {
    return prisma.scheduleEntry.findFirst({ where: { id, userId }, include: entryInclude });
  },

  createEntry(userId: string, data: Omit<Prisma.ScheduleEntryUncheckedCreateInput, 'userId'>) {
    return prisma.scheduleEntry.create({ data: { ...data, userId }, include: entryInclude });
  },

  updateEntry(id: string, data: Prisma.ScheduleEntryUncheckedUpdateInput) {
    return prisma.scheduleEntry.update({ where: { id }, data, include: entryInclude });
  },

  deactivateEntry(id: string) {
    return prisma.scheduleEntry.update({ where: { id }, data: { isActive: false }, include: entryInclude });
  },

  listExceptionsForDate(userId: string, date: Date) {
    return prisma.scheduleException.findMany({ where: { userId, date }, include: exceptionInclude });
  },

  listExceptionsForRange(userId: string, from: Date, to: Date) {
    return prisma.scheduleException.findMany({
      where: { userId, date: { gte: from, lte: to } },
      include: exceptionInclude,
    });
  },

  findExceptionForUser(id: string, userId: string) {
    return prisma.scheduleException.findFirst({ where: { id, userId }, include: exceptionInclude });
  },

  findExceptionBySourceAndDate(userId: string, sourceScheduleEntryId: string, date: Date) {
    return prisma.scheduleException.findFirst({ where: { userId, sourceScheduleEntryId, date } });
  },

  createException(userId: string, data: Omit<Prisma.ScheduleExceptionUncheckedCreateInput, 'userId'>) {
    return prisma.scheduleException.create({ data: { ...data, userId }, include: exceptionInclude });
  },

  updateException(id: string, data: Prisma.ScheduleExceptionUncheckedUpdateInput) {
    return prisma.scheduleException.update({ where: { id }, data, include: exceptionInclude });
  },

  deleteException(id: string) {
    return prisma.scheduleException.delete({ where: { id } });
  },
};
