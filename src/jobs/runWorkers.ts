import 'dotenv/config';
import { logger } from '../common/logger';
import { env } from '../config/env';
import { startScheduleProcessingWorker } from './workers/scheduleProcessingWorker';
import { registerRepeatableJobs } from './scheduler';
import { disconnectPrisma } from '../db/prisma';
import { disconnectRedis } from '../db/redis';
import { closeQueues } from './queues';

/**
 * Splits the schedule-processing worker out into its own process (see the matching comment in
 * server.ts, which runs it in-process by default). Reminder delivery has no worker at all
 * anymore — QStash calls the API directly — so this only ever starts the one worker now.
 */
async function main() {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — every push notification will fail to send');
  }

  const scheduleProcessingWorker = startScheduleProcessingWorker();
  await registerRepeatableJobs();

  logger.info('Workers started');

  async function shutdown(signal: string) {
    logger.info({ signal }, 'Worker process shutting down');
    await scheduleProcessingWorker.close();
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
