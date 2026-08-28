import { prisma } from '../../db/prisma';
import { notificationsRepository } from './notifications.repository';
import { sendPushNotification } from './web-push.util';

export interface ReminderPayload {
  notificationJobId: string;
  userId: string;
  activityLogId: string;
  activityName: string;
  /** pre-reminder = text only, nothing actionable yet. end-check's copy/actions are
   * recomputed from the log's live status at delivery time (see below) rather than read from
   * `actions`/here, since the outcome can only be known then. The other two use both as-is. */
  kind: 'pre-reminder' | 'timed-actionable' | 'timeless-actionable' | 'end-check';
  /** Action keys the service worker renders as notification buttons (worker/index.js). */
  actions: ('start' | 'complete' | 'skip' | 'close')[];
}

const KIND_COPY: Record<
  Exclude<ReminderPayload['kind'], 'end-check'>,
  (activityName: string) => { title: string; body: string }
> = {
  'pre-reminder': (activityName) => ({ title: 'Coming up', body: `${activityName} starts soon` }),
  'timed-actionable': (activityName) => ({ title: activityName, body: "It's time — start or skip." }),
  'timeless-actionable': (activityName) => ({ title: activityName, body: 'Anytime today — mark it complete or close it out.' }),
};

/**
 * The end-check stage fires at an occurrence's planned end regardless of what actually
 * happened — unlike the other stages, its copy/actions can't be decided when it's scheduled,
 * only right now, from the log's current status. Returns null when there's nothing worth
 * saying: the log is missing, or already resolved (completed/skipped/etc — including by the
 * MISSED sweep, which itself does NOT count as resolved, since it's just a "wasn't acted on in
 * time" label, not a verdict — the user still hasn't said what happened).
 */
async function buildEndCheckNotification(
  activityLogId: string,
  activityName: string,
): Promise<{ title: string; body: string; actions: ReminderPayload['actions'] } | null> {
  const log = await prisma.activityLog.findUnique({ where: { id: activityLogId } });
  if (!log) return null;

  switch (log.status) {
    case 'IN_PROGRESS':
      return { title: activityName, body: "Time's up — mark it complete when you're done.", actions: ['complete'] };
    case 'PLANNED':
      // Still genuinely unresolved (the MISSED sweep hasn't caught up to this yet) — Skip is
      // still a meaningful, honest answer here.
      return { title: activityName, body: 'Did you get to this? Complete it or skip it.', actions: ['complete', 'skip'] };
    case 'MISSED':
      // Already the system's own "not done" label — Skip would just re-say that, so only
      // Complete (if it actually happened elsewhere) is offered.
      return { title: activityName, body: 'Did you get to this? Mark it complete if so.', actions: ['complete'] };
    default:
      // COMPLETED / SKIPPED / CANCELLED / ADJUSTED — already resolved, nothing to nudge about.
      return null;
  }
}

/**
 * Delivers one reminder stage. Shared by both delivery mechanisms (BullMQ's worker and the
 * QStash callback) so they can never silently drift from each other — whichever one actually
 * fires first "wins": the status check below is the single idempotency guard that makes it
 * safe for a reminder to be scheduled via both at once (e.g. mid-migration, or if QStash isn't
 * configured and BullMQ is the fallback) without ever double-sending a real push.
 *
 * Throws only when every push delivery failed for a transient reason — the caller decides
 * whether/how to retry (BullMQ's own retry policy, or the QStash callback's response status)
 * and whether the failure is final enough to call `markFailed`. Every other outcome (success,
 * no subscriptions, nothing to say) is terminal and already recorded before this returns.
 */
export async function deliverReminder(payload: ReminderPayload): Promise<void> {
  const { notificationJobId, userId, activityName, kind, actions } = payload;

  const notificationJob = await prisma.notificationJob.findUnique({ where: { id: notificationJobId } });
  if (!notificationJob || notificationJob.status !== 'SCHEDULED') {
    // Cancelled/rescheduled/already sent — nothing to do. This is the idempotency guard.
    return;
  }

  const copy =
    kind === 'end-check'
      ? await buildEndCheckNotification(payload.activityLogId, activityName)
      : { ...KIND_COPY[kind](activityName), actions: actions ?? [] };

  if (!copy) {
    // end-check found nothing worth saying (already resolved) — this stage is done.
    await notificationsRepository.markSent(notificationJobId);
    return;
  }

  const subscriptions = await notificationsRepository.findActiveSubscriptionsForUser(userId);
  if (subscriptions.length === 0) {
    await notificationsRepository.markFailed(notificationJobId, 'No active push subscriptions', 0);
    return;
  }

  const pushPayload = {
    title: copy.title,
    body: copy.body,
    activityLogId: payload.activityLogId,
    actions: copy.actions,
    // Read by the frontend's service worker (worker/index.js) to deep-link a notification
    // click straight to the relevant item on the dashboard.
    url: `/dashboard?logId=${payload.activityLogId}`,
  };

  let anySucceeded = false;
  let lastError = '';

  for (const subscription of subscriptions) {
    const result = await sendPushNotification(
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      pushPayload,
    );

    if (result.ok) {
      anySucceeded = true;
      await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } });
    } else if (result.permanent) {
      await notificationsRepository.revokeSubscription(subscription.id);
    } else {
      lastError = result.error;
    }
  }

  if (anySucceeded) {
    await notificationsRepository.markSent(notificationJobId);
  } else {
    throw new Error(lastError || 'All push deliveries failed');
  }
}
