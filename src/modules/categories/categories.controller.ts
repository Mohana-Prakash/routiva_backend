import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { categoriesService } from './categories.service';
import type { CreateCategoryInput, UpdateCategoryInput } from './categories.validation';

export const categoriesController = {
  async list(req: Request, res: Response) {
    const includeInactive = (req.query as { includeInactive?: boolean }).includeInactive ?? false;
    const categories = await categoriesService.list(req.userId as string, includeInactive);
    sendSuccess(res, { categories });
  },

  async create(req: Request, res: Response) {
    const category = await categoriesService.create(req.userId as string, req.body as CreateCategoryInput);
    sendCreated(res, { category });
  },

  async update(req: Request, res: Response) {
    const category = await categoriesService.update(req.params.id as string, req.userId as string, req.body as UpdateCategoryInput);
    sendSuccess(res, { category });
  },

  async remove(req: Request, res: Response) {
    const category = await categoriesService.deactivate(req.params.id as string, req.userId as string);
    sendSuccess(res, { category });
  },
};
