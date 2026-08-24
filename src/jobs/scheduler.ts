import { getScheduleProcessingQueue } from './queues';
import { logger } from '../common/logger';

/** Registers repeatable jobs. Safe to call on every boot: BullMQ dedupes by repeat key. */
export async function registerRepeatableJobs(): Promise<void> {
  const queue = getScheduleProcessingQueue();
  await queue.add(
    'reconcile-all-users',
    {},
    {
      jobId: 'reconcile-all-users-repeatable',
      repeat: { every: 2 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  logger.info('Registered repeatable schedule-processing job (every 2 minutes)');
}
