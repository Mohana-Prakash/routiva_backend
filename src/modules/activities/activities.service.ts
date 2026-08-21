import { AppError } from '../../common/errors/AppError';
import { categoriesRepository } from '../categories/categories.repository';
import { activitiesRepository } from './activities.repository';
import type { CreateActivityInput, UpdateActivityInput } from './activities.validation';

async function assertCategoryOwnership(categoryId: string | null | undefined, userId: string): Promise<void> {
  if (!categoryId) return;
  const category = await categoriesRepository.findByIdForUser(categoryId, userId);
  if (!category) {
    throw AppError.validation('categoryId does not reference a category you own');
  }
  if (!category.isActive) {
    throw AppError.validation('categoryId references an inactive category');
  }
}

export const activitiesService = {
  list(userId: string, includeInactive: boolean, categoryId?: string) {
    return activitiesRepository.list(userId, includeInactive, categoryId);
  },

  async getOwned(id: string, userId: string) {
    const activity = await activitiesRepository.findByIdForUser(id, userId);
    if (!activity) throw AppError.notFound('Activity not found');
    return activity;
  },

  async create(userId: string, input: CreateActivityInput) {
    await assertCategoryOwnership(input.categoryId, userId);
    return activitiesRepository.create(userId, input);
  },

  async update(id: string, userId: string, input: UpdateActivityInput) {
    const existing = await activitiesService.getOwned(id, userId);
    if (!existing.isActive && input.isActive !== true) {
      throw AppError.invalidState('Cannot modify an archived activity');
    }
    if (input.categoryId !== undefined) {
      await assertCategoryOwnership(input.categoryId, userId);
    }
    return activitiesRepository.update(id, input);
  },

  /** Archiving never deletes the row: historical activity_logs must keep referencing it. */
  async archive(id: string, userId: string) {
    await activitiesService.getOwned(id, userId);
    return activitiesRepository.archive(id);
  },
};
