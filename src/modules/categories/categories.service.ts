import { AppError } from '../../common/errors/AppError';
import { activitiesRepository } from '../activities/activities.repository';
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

  /**
   * Deactivating a category cascades: any activity still active under it is deactivated too,
   * so nothing is left pointing at a category the user has just turned off. The frontend
   * warns and confirms with the user before calling this when that cascade would affect
   * anything (see CategoryList.tsx), but the cascade itself always runs here regardless of
   * caller, so the invariant (no active activity under an inactive category) can't be
   * bypassed by calling the API directly.
   */
  async update(id: string, userId: string, input: UpdateCategoryInput) {
    await categoriesService.getOwned(id, userId);

    if (input.name) {
      const existing = await categoriesRepository.findByNameForUser(input.name, userId);
      if (existing && existing.id !== id) {
        throw AppError.duplicate('A category with this name already exists');
      }
    }

    const updated = await categoriesRepository.update(id, input);
    if (input.isActive === false) {
      await activitiesRepository.deactivateAllForCategory(id);
    }
    return updated;
  },
};
