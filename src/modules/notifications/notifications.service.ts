import { AppError } from '../../common/errors/AppError';
import { notificationsRepository } from './notifications.repository';
import type { SubscribeInput, UpdatePreferencesInput } from './notifications.validation';

export const notificationsService = {
  async subscribe(userId: string, input: SubscribeInput) {
    return notificationsRepository.upsertSubscription(userId, {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent ?? null,
    });
  },

  async unsubscribe(userId: string, endpoint: string) {
    const subscription = await notificationsRepository.findSubscriptionByEndpointForUser(endpoint, userId);
    if (!subscription) throw AppError.notFound('Push subscription not found');
    await notificationsRepository.revokeSubscription(subscription.id);
  },

  getPreferences(userId: string) {
    return notificationsRepository.getOrCreatePreferences(userId);
  },

  updatePreferences(userId: string, input: UpdatePreferencesInput) {
    return notificationsRepository.updatePreferences(userId, input);
  },
};
