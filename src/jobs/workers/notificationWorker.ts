import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../../db/redis';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../common/logger';
import { notificationsRepository } from '../../modules/notifications/notifications.repository';
import { deliverReminder, type ReminderPayload } from '../../modules/notifications/reminder-delivery';

/**
 * Kept as the fallback delivery path for environments where QStash isn't configured (local
 * dev — QStash cannot reach localhost, see qstash.util.ts) — see notification-scheduler.ts for
 * which path a given reminder actually goes through. `deliverReminder` is the same function the
 * QStash callback uses, so the two paths can never silently behave differently.
 */
async function processReminder(job: Job<ReminderPayload>): Promise<void> {
  await deliverReminder(job.data);
}

export function startNotificationWorker(): Worker<ReminderPayload> {
  const worker = new Worker<ReminderPayload>(QUEUE_NAMES.notifications, processReminder, {
    connection: createRedisConnection(),
    concurrency: 10,
    // Default is 30s, i.e. a Redis round-trip twice a minute forever just to check for
    // crashed workers, independent of whether there's ever anything to process. This app's
    // job volume is tiny and a stalled job sitting an extra minute or two before recovery is
    // harmless, so trading a little recovery latency for far less constant Redis chatter
    // (see notification-scheduler.ts's churn comment) is the right call here.
    stalledInterval: 120_000,
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
