import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { notificationsService } from './notifications.service';
import type { SubscribeInput, UnsubscribeInput, UpdatePreferencesInput } from './notifications.validation';

export const notificationsController = {
  async subscribe(req: Request, res: Response) {
    const subscription = await notificationsService.subscribe(req.userId as string, req.body as SubscribeInput);
    sendCreated(res, { subscription: { id: subscription.id, endpoint: subscription.endpoint, createdAt: subscription.createdAt } });
  },

  async unsubscribe(req: Request, res: Response) {
    const { endpoint } = req.body as UnsubscribeInput;
    await notificationsService.unsubscribe(req.userId as string, endpoint);
    res.status(204).send();
  },

  async getPreferences(req: Request, res: Response) {
    const preferences = await notificationsService.getPreferences(req.userId as string);
    sendSuccess(res, { preferences });
  },

  async updatePreferences(req: Request, res: Response) {
    const preferences = await notificationsService.updatePreferences(req.userId as string, req.body as UpdatePreferencesInput);
    sendSuccess(res, { preferences });
  },
};
