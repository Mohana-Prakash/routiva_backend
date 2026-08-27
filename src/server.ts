import 'dotenv/config';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './common/logger';
import { prisma, disconnectPrisma } from './db/prisma';
import { disconnectRedis, getRedisClient } from './db/redis';
import { registerRepeatableJobs } from './jobs/scheduler';
import { closeQueues } from './jobs/queues';
import { startNotificationWorker } from './jobs/workers/notificationWorker';
import { startScheduleProcessingWorker } from './jobs/workers/scheduleProcessingWorker';

async function main() {
  await prisma.$connect();
  getRedisClient();
  await registerRepeatableJobs();

  // Runs the reminder/schedule-reconciliation workers in this same process instead of a
  // separate service — this app runs at a scale (single user) where a dedicated worker
  // instance is pure cost with no benefit. If that ever changes, `npm run worker:start`
  // (jobs/runWorkers.ts) still exists to split them out again.
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    logger.warn('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set — every push notification will fail to send');
  }
  const notificationWorker = startNotificationWorker();
  const scheduleProcessingWorker = startScheduleProcessingWorker();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
  });

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Received shutdown signal, closing gracefully');

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, 'Error while closing HTTP server');
      }
      try {
        await Promise.all([notificationWorker.close(), scheduleProcessingWorker.close()]);
        await closeQueues();
        await disconnectPrisma();
        await disconnectRedis();
        logger.info('Shutdown complete');
        process.exit(err ? 1 : 0);
      } catch (shutdownErr) {
        logger.error({ err: shutdownErr }, 'Error during shutdown');
        process.exit(1);
      }
    });

    // Force-exit if graceful shutdown hangs.
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err);
  process.exit(1);
});
