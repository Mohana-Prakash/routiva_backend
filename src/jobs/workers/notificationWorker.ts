import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../../db/redis';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../common/logger';
import { prisma } from '../../db/prisma';
import { notificationsRepository } from '../../modules/notifications/notifications.repository';
import { sendPushNotification } from '../../modules/notifications/web-push.util';

interface ReminderJobData {
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
  Exclude<ReminderJobData['kind'], 'end-check'>,
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
): Promise<{ title: string; body: string; actions: ReminderJobData['actions'] } | null> {
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

async function processReminder(job: Job<ReminderJobData>): Promise<void> {
  const { notificationJobId, userId, activityName, kind, actions } = job.data;

  const notificationJob = await prisma.notificationJob.findUnique({ where: { id: notificationJobId } });
  if (!notificationJob || notificationJob.status !== 'SCHEDULED') {
    // Cancelled/rescheduled/already sent — nothing to do. This is the idempotency guard.
    return;
  }

  const copy =
    kind === 'end-check'
      ? await buildEndCheckNotification(job.data.activityLogId, activityName)
      : { ...KIND_COPY[kind](activityName), actions: actions ?? [] };

  if (!copy) {
    // end-check found nothing worth saying (already resolved) — this stage is done.
    await notificationsRepository.markSent(notificationJobId);
    return;
  }

  const subscriptions = await notificationsRepository.findActiveSubscriptionsForUser(userId);
  if (subscriptions.length === 0) {
    await notificationsRepository.markFailed(notificationJobId, 'No active push subscriptions', job.attemptsMade);
    return;
  }

  const payload = {
    title: copy.title,
    body: copy.body,
    activityLogId: job.data.activityLogId,
    actions: copy.actions,
    // Read by the frontend's service worker (worker/index.js) to deep-link a notification
    // click straight to the relevant item on the dashboard.
    url: `/dashboard?logId=${job.data.activityLogId}`,
  };

  let anySucceeded = false;
  let lastError = '';

  for (const subscription of subscriptions) {
    const result = await sendPushNotification(
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      payload,
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
    // Throwing lets BullMQ apply the configured retry/backoff policy for transient failures.
    throw new Error(lastError || 'All push deliveries failed');
  }
}

export function startNotificationWorker(): Worker<ReminderJobData> {
  const worker = new Worker<ReminderJobData>(QUEUE_NAMES.notifications, processReminder, {
    connection: createRedisConnection(),
    concurrency: 10,
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Notification job failed');
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      notificationsRepository
        .markFailed(job.data.notificationJobId, err.message, job.attemptsMade)
        .catch((e) => logger.error({ err: e }, 'Failed to persist notification failure'));
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Notification worker error');
  });

  return worker;
}
