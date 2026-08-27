import { Worker, Job } from 'bullmq';
import { DateTime } from 'luxon';
import { createRedisConnection } from '../../db/redis';
import { QUEUE_NAMES } from '../queues';
import { logger } from '../../common/logger';
import { prisma } from '../../db/prisma';
import { schedulesService } from '../../modules/schedules/schedules.service';
import { trackingRepository } from '../../modules/tracking/tracking.repository';
import { todayInTimezone } from '../../common/utils/time';

function dateStringToDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Runs periodically (see jobs/scheduler.ts). For every active user: materializes today's
 * (and yesterday's, to catch stragglers whose day just ended) schedule so reminders are
 * queued even if the user never opens the app, then sweeps expired PLANNED logs to MISSED —
 * a label meaning "the window passed without being acted on", not a final verdict. It does
 * NOT touch IN_PROGRESS logs: the system never assumes an activity is completed just because
 * time ran out. The user stays in control — Complete/Skip remain available on a MISSED (and
 * an overrun IN_PROGRESS) log indefinitely, so nothing is silently decided for them. Timeless
 * logs (no fixed slot) use a day-boundary rule instead — they expire once their whole
 * activityDate has passed, since there's no specific end time to compare against. Workers are
 * restart-safe: all state lives in Postgres/Redis, nothing in process memory.
 */
async function reconcileAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, timezone: true } });
  const now = new Date();

  for (const user of users) {
    try {
      const today = todayInTimezone(user.timezone);
      const yesterday = DateTime.fromISO(today).minus({ days: 1 }).toFormat('yyyy-MM-dd');
      const todayDbDate = dateStringToDbDate(today);

      await schedulesService.renderAndMaterializeDate(user.id, yesterday, user.timezone);
      await schedulesService.renderAndMaterializeDate(user.id, today, user.timezone);

      const expiredPlanned = [
        ...(await trackingRepository.findExpiredPlanned(user.id, now)),
        ...(await trackingRepository.findExpiredTimelessPlanned(user.id, todayDbDate)),
      ];
      if (expiredPlanned.length > 0) {
        await trackingRepository.markMissed(expiredPlanned.map((l) => l.id));
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
