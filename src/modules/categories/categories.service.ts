import { AppError } from '../../common/errors/AppError';
import { categoriesRepository } from './categories.repository';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validation';

export const categoriesService = {
  list(userId: string, includeInactive: boolean) {
    return categoriesRepository.list(userId, includeInactive);
  },

  async getOwned(id: string, userId: string) {
    const category = await categoriesRepository.findByIdForUser(id, userId);
    if (!category) throw AppError.notFound('Category not found');
    return category;
  },

  async create(userId: string, input: CreateCategoryInput) {
    const existing = await categoriesRepository.findByNameForUser(input.name, userId);
    if (existing) {
      throw AppError.duplicate('A category with this name already exists');
    }
    return categoriesRepository.create(userId, input);
  },

  async update(id: string, userId: string, input: UpdateCategoryInput) {
    await categoriesService.getOwned(id, userId);

    if (input.name) {
      const existing = await categoriesRepository.findByNameForUser(input.name, userId);
      if (existing && existing.id !== id) {
        throw AppError.duplicate('A category with this name already exists');
      }
    }

    return categoriesRepository.update(id, input);
  },

  /** Categories are never hard-deleted: activities and historical logs may still reference them. */
  async deactivate(id: string, userId: string) {
    await categoriesService.getOwned(id, userId);
    return categoriesRepository.deactivate(id);
  },
};
