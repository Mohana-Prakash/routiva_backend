import { prisma } from '../../db/prisma';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validation';

export const categoriesRepository = {
  list(userId: string, includeInactive: boolean) {
    return prisma.category.findMany({
      where: { userId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.category.findFirst({ where: { id, userId } });
  },

  findByNameForUser(name: string, userId: string) {
    return prisma.category.findFirst({ where: { userId, name } });
  },

  create(userId: string, data: CreateCategoryInput) {
    return prisma.category.create({ data: { ...data, userId } });
  },

  update(id: string, data: UpdateCategoryInput) {
    return prisma.category.update({ where: { id }, data });
  },


  countActivitiesForCategory(id: string) {
    return prisma.activity.count({ where: { categoryId: id } });
  },
};
