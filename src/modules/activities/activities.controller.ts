import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { activitiesService } from './activities.service';
import type { CreateActivityInput, UpdateActivityInput } from './activities.validation';

// Wire shape matches the frontend's `Activity` type (types/activity.ts).
function toActivityDto(activity: {
  id: string;
  userId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  alarmEnabled: boolean;
  alarmOffsetMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}) {
  return {
    id: activity.id,
    userId: activity.userId,
    categoryId: activity.categoryId,
    name: activity.name,
    description: activity.description,
    alarmEnabled: activity.alarmEnabled,
    alarmOffsetMinutes: activity.alarmOffsetMinutes,
    isActive: activity.isActive,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
    archivedAt: activity.archivedAt ? activity.archivedAt.toISOString() : null,
  };
}

export const activitiesController = {
  async list(req: Request, res: Response) {
    const query = req.query as { includeInactive?: boolean; categoryId?: string };
    const activities = await activitiesService.list(req.userId as string, query.includeInactive ?? false, query.categoryId);
    sendSuccess(res, activities.map(toActivityDto));
  },

  async get(req: Request, res: Response) {
    const activity = await activitiesService.getOwned(req.params.id as string, req.userId as string);
    sendSuccess(res, toActivityDto(activity));
  },

  async create(req: Request, res: Response) {
    const activity = await activitiesService.create(req.userId as string, req.body as CreateActivityInput);
    sendCreated(res, toActivityDto(activity));
  },

  async update(req: Request, res: Response) {
    const activity = await activitiesService.update(req.params.id as string, req.userId as string, req.body as UpdateActivityInput);
    sendSuccess(res, toActivityDto(activity));
  },

  async remove(req: Request, res: Response) {
    await activitiesService.remove(req.params.id as string, req.userId as string);
    res.status(204).send();
  },
};
