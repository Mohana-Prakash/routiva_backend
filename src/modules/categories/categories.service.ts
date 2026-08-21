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

  /**
   * Permanently deletes the row. The activities->category FK is SetNull rather than
   * Restrict (an activity can outlive its category), so unlike activity deletion this has
   * to be guarded explicitly: any category still assigned to an activity is blocked with a
   * friendly error instead of silently orphaning those activities' categoryId.
   */
  async remove(id: string, userId: string) {
    await categoriesService.getOwned(id, userId);
    const activityCount = await categoriesRepository.countActivitiesForCategory(id);
    if (activityCount > 0) {
      throw AppError.resourceInUse('This category has activities using it and cannot be permanently deleted. Deactivate it instead.');
    }
    return categoriesRepository.remove(id);
  },
};
