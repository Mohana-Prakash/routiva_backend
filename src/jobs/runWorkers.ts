import 'dotenv/config';
import { logger } from '../common/logger';
import { startNotificationWorker } from './workers/notificationWorker';
import { startScheduleProcessingWorker } from './workers/scheduleProcessingWorker';
import { registerRepeatableJobs } from './scheduler';
import { disconnectPrisma } from '../db/prisma';
import { disconnectRedis } from '../db/redis';
import { closeQueues } from './queues';

async function main() {
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
