import { Worker, Job } from 'bullmq';
import { DateTime } from 'luxon';
import { createRedisConnection } from '../../db/redis';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../common/logger';
import { prisma } from '../../db/prisma';
import { schedulesService } from '../../modules/schedules/schedules.service';
import { trackingRepository } from '../../modules/tracking/tracking.repository';
import { todayInTimezone } from '../../common/utils/time';

/**
 * Runs periodically (see jobs/scheduler.ts). For every active user: materializes today's
 * (and yesterday's, to catch stragglers whose day just ended) schedule so reminders are
 * queued even if the user never opens the app, then sweeps expired PLANNED logs to MISSED.
 * Workers are restart-safe: all state lives in Postgres/Redis, nothing in process memory.
 */
async function reconcileAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, timezone: true } });

  for (const user of users) {
    try {
      const today = todayInTimezone(user.timezone);
      const yesterday = DateTime.fromISO(today).minus({ days: 1 }).toFormat('yyyy-MM-dd');

      await schedulesService.renderAndMaterializeDate(user.id, yesterday, user.timezone);
      await schedulesService.renderAndMaterializeDate(user.id, today, user.timezone);

      const expired = await trackingRepository.findExpiredPlanned(user.id, new Date());
      if (expired.length > 0) {
        await trackingRepository.markMissed(expired.map((l) => l.id));
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Schedule reconciliation failed for user');
    }
  }
}

async function processJob(job: Job): Promise<void> {
  if (job.name === 'reconcile-all-users') {
    await reconcileAllUsers();
  }
}

export function startScheduleProcessingWorker(): Worker {
  const worker = new Worker(QUEUE_NAMES.scheduleProcessing, processJob, {
    connection: createRedisConnection(),
    concurrency: 1,
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Schedule processing job failed');
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'Schedule processing worker error');
  });

  return worker;
}
