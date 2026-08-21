import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { categoriesService } from './categories.service';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validation';

const DEFAULT_CATEGORY_COLOR = '#64748b'; // neutral slate — matches schedules' fallback

// Wire shape matches the frontend's `Category` type (types/category.ts), which requires a
// non-null `color`; our schema allows null (never set), so a default fills the gap.
function toCategoryDto(category: {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: category.id,
    userId: category.userId,
    name: category.name,
    icon: category.icon,
    color: category.color ?? DEFAULT_CATEGORY_COLOR,
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export const categoriesController = {
  async list(req: Request, res: Response) {
    const includeInactive = (req.query as { includeInactive?: boolean }).includeInactive ?? false;
    const categories = await categoriesService.list(req.userId as string, includeInactive);
    sendSuccess(res, categories.map(toCategoryDto));
  },

  async create(req: Request, res: Response) {
    const category = await categoriesService.create(req.userId as string, req.body as CreateCategoryInput);
    sendCreated(res, toCategoryDto(category));
  },

  async update(req: Request, res: Response) {
    const category = await categoriesService.update(req.params.id as string, req.userId as string, req.body as UpdateCategoryInput);
    sendSuccess(res, toCategoryDto(category));
  },

  async remove(req: Request, res: Response) {
    await categoriesService.remove(req.params.id as string, req.userId as string);
    res.status(204).send();
  },
};
