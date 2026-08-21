import { Request, Response } from 'express';
import { sendCreated, sendSuccess } from '../../common/utils/response';
import { notificationsService } from './notifications.service';
import type { SubscribeInput, UnsubscribeInput, UpdatePreferencesInput } from './notifications.validation';

// Wire shape matches the frontend's `NotificationPreferences` type (types/notification.ts):
// our internal `defaultAlarmOffset` field is exposed as `defaultAlarmOffsetMinutes`.
function toPreferencesDto(preferences: {
  pushEnabled: boolean;
  defaultAlarmOffset: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}) {
  return {
    pushEnabled: preferences.pushEnabled,
    defaultAlarmOffsetMinutes: preferences.defaultAlarmOffset,
    quietHoursEnabled: preferences.quietHoursEnabled,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
  };
}

export const notificationsController = {
  async subscribe(req: Request, res: Response) {
    await notificationsService.subscribe(req.userId as string, req.body as SubscribeInput);
    sendCreated(res, null);
  },

  async unsubscribe(req: Request, res: Response) {
    const { endpoint } = req.body as UnsubscribeInput;
    await notificationsService.unsubscribe(req.userId as string, endpoint);
    res.status(204).send();
  },

  async getPreferences(req: Request, res: Response) {
    const preferences = await notificationsService.getPreferences(req.userId as string);
    sendSuccess(res, toPreferencesDto(preferences));
  },

  async updatePreferences(req: Request, res: Response) {
    const preferences = await notificationsService.updatePreferences(req.userId as string, req.body as UpdatePreferencesInput);
    sendSuccess(res, toPreferencesDto(preferences));
  },
};
