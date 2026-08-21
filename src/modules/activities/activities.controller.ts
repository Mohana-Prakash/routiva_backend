import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { activitiesService } from './activities.service';
import type { CreateActivityInput, UpdateActivityInput } from './activities.validation';

export const activitiesController = {
  async list(req: Request, res: Response) {
    const query = req.query as { includeInactive?: boolean; categoryId?: string };
    const activities = await activitiesService.list(req.userId as string, query.includeInactive ?? false, query.categoryId);
    sendSuccess(res, { activities });
  },

  async get(req: Request, res: Response) {
    const activity = await activitiesService.getOwned(req.params.id as string, req.userId as string);
    sendSuccess(res, { activity });
  },

  async create(req: Request, res: Response) {
    const activity = await activitiesService.create(req.userId as string, req.body as CreateActivityInput);
    sendCreated(res, { activity });
  },

  async update(req: Request, res: Response) {
    const activity = await activitiesService.update(req.params.id as string, req.userId as string, req.body as UpdateActivityInput);
    sendSuccess(res, { activity });
  },

  async remove(req: Request, res: Response) {
    const activity = await activitiesService.archive(req.params.id as string, req.userId as string);
    sendSuccess(res, { activity });
  },
};
