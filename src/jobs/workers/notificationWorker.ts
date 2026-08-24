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
  /** pre-reminder = text only, nothing actionable yet. The other two carry `actions`. */
  kind: 'pre-reminder' | 'timed-actionable' | 'timeless-actionable';
  /** Action keys the service worker renders as notification buttons (worker/index.js). */
  actions: ('start' | 'complete' | 'skip' | 'close')[];
}

const KIND_COPY: Record<ReminderJobData['kind'], (activityName: string) => { title: string; body: string }> = {
  'pre-reminder': (activityName) => ({ title: 'Coming up', body: `${activityName} starts soon` }),
  'timed-actionable': (activityName) => ({ title: activityName, body: "It's time — start, complete, or skip." }),
  'timeless-actionable': (activityName) => ({ title: activityName, body: 'Anytime today — mark it complete or close it out.' }),
};

async function processReminder(job: Job<ReminderJobData>): Promise<void> {
  const { notificationJobId, userId, activityName, kind, actions } = job.data;

  const notificationJob = await prisma.notificationJob.findUnique({ where: { id: notificationJobId } });
  if (!notificationJob || notificationJob.status !== 'SCHEDULED') {
    // Cancelled/rescheduled/already sent — nothing to do. This is the idempotency guard.
    return;
  }

  const subscriptions = await notificationsRepository.findActiveSubscriptionsForUser(userId);
  if (subscriptions.length === 0) {
    await notificationsRepository.markFailed(notificationJobId, 'No active push subscriptions', job.attemptsMade);
    return;
  }

  const copy = KIND_COPY[kind](activityName);
  const payload = {
    title: copy.title,
    body: copy.body,
    activityLogId: job.data.activityLogId,
    actions: actions ?? [],
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
