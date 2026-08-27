import 'dotenv/config';
import { logger } from '../common/logger';
import { env } from '../config/env';
import { startNotificationWorker } from './workers/notificationWorker';
import { startScheduleProcessingWorker } from './workers/scheduleProcessingWorker';
import { registerRepeatableJobs } from './scheduler';
import { disconnectPrisma } from '../db/prisma';
import { disconnectRedis } from '../db/redis';
import { closeQueues } from './queues';

async function main() {
  // Otherwise every push send fails with "VAPID keys are not configured" only after a job's
  // retries exhaust (web-push.util.ts), which is easy to miss — this surfaces it immediately,
  // once, at the moment it'd actually explain "no reminders are arriving at all".
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — every push notification will fail to send');
  }

  const notificationWorker = startNotificationWorker();
  const scheduleProcessingWorker = startScheduleProcessingWorker();
  await registerRepeatableJobs();

  logger.info('Workers started');

  async function shutdown(signal: string) {
    logger.info({ signal }, 'Worker process shutting down');
    await Promise.all([notificationWorker.close(), scheduleProcessingWorker.close()]);
    await closeQueues();
    await disconnectPrisma();
    await disconnectRedis();
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Worker process failed to start');
  process.exit(1);
});
