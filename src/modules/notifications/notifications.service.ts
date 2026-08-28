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

  async getPreferences(userId: string) {
    const [preferences, subscriptions] = await Promise.all([
      notificationsRepository.getOrCreatePreferences(userId),
      notificationsRepository.findActiveSubscriptionsForUser(userId),
    ]);
    // The frontend's local browser check (does *this* device have a saved PushSubscription
    // object) can't tell whether the backend actually still has it on file — a subscription
    // can be silently revoked server-side (e.g. after a 410 from the push service) without the
    // browser ever finding out. This is the source of truth for "will a reminder actually reach
    // me anywhere", used to warn the user when it's false despite everything looking fine
    // locally.
    return { ...preferences, hasActiveSubscription: subscriptions.length > 0 };
  },

  updatePreferences(userId: string, input: UpdatePreferencesInput) {
    return notificationsRepository.updatePreferences(userId, input);
  },
};
