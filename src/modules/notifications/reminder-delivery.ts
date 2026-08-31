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
  /** The occurrence's planned start time, "HH:mm" in the user's own timezone (already resolved
   * at schedule time — see notification-scheduler.ts) — shown in the notification body so it's
   * clear which slot this is about without opening the app. Absent for timeless-actionable,
   * which has no fixed start time. */
  startTime?: string;
}

const KIND_COPY: Record<
  Exclude<ReminderPayload['kind'], 'end-check' | 'timeless-actionable'>,
  (activityName: string, startTime: string) => { title: string; body: string }
> = {
  'pre-reminder': (activityName, startTime) => ({ title: 'Coming up', body: `${activityName} starts at ${startTime}` }),
  'timed-actionable': (activityName, startTime) => ({ title: activityName, body: `Scheduled for ${startTime} — start or skip.` }),
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
  startTime: string | undefined,
): Promise<{ title: string; body: string; actions: ReminderPayload['actions'] } | null> {
  const log = await prisma.activityLog.findUnique({ where: { id: activityLogId } });
  if (!log) return null;

  const at = startTime ? ` (${startTime})` : '';
  switch (log.status) {
    case 'IN_PROGRESS':
      return { title: activityName, body: `Time's up${at} — mark it complete when you're done.`, actions: ['complete'] };
    case 'PLANNED':
      // Still genuinely unresolved (the MISSED sweep hasn't caught up to this yet) — Skip is
      // still a meaningful, honest answer here.
      return { title: activityName, body: `Did you get to this${at}? Complete it or skip it.`, actions: ['complete', 'skip'] };
    case 'MISSED':
      // Already the system's own "not done" label — Skip would just re-say that, so only
      // Complete (if it actually happened elsewhere) is offered.
      return { title: activityName, body: `Did you get to this${at}? Mark it complete if so.`, actions: ['complete'] };
    default:
      // COMPLETED / SKIPPED / CANCELLED / ADJUSTED — already resolved, nothing to nudge about.
      return null;
  }
}

/**
 * Delivers one reminder stage — called from the QStash callback (qstash.controller.ts). Kept
 * as its own module (rather than inlined into the controller) so the actual delivery logic
 * stays testable independent of the HTTP layer, and stays a single place to change if delivery
 * ever needs to change again.
 *
 * The status check below is the idempotency guard: a redelivered/retried message finds the job
 * no longer SCHEDULED and safely no-ops instead of sending a duplicate push.
 *
 * Throws only when every push delivery failed for a transient reason — the caller (the QStash
 * callback) decides whether to let QStash retry or, once its retries are exhausted, to call
 * `markFailed` itself. Every other outcome (success, no subscriptions, nothing to say) is
 * terminal and already recorded in the database before this returns.
 */
export async function deliverReminder(payload: ReminderPayload): Promise<void> {
  const { notificationJobId, userId, activityName, kind, actions, startTime } = payload;

  const notificationJob = await prisma.notificationJob.findUnique({ where: { id: notificationJobId } });
  if (!notificationJob || notificationJob.status !== 'SCHEDULED') {
    // Cancelled/rescheduled/already sent — nothing to do. This is the idempotency guard.
    return;
  }

  const copy =
    kind === 'end-check'
      ? await buildEndCheckNotification(payload.activityLogId, activityName, startTime)
      : kind === 'timeless-actionable'
        ? { title: activityName, body: 'Anytime today — mark it complete or close it out.', actions: actions ?? [] }
        : { ...KIND_COPY[kind](activityName, startTime ?? ''), actions: actions ?? [] };

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
