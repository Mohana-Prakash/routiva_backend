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
      // Materializes today's occurrences and sweeps expired PLANNED logs to MISSED — neither
      // needs sub-5-minute precision. Reminders themselves still fire exactly on time regardless
      // of this interval, since BullMQ delivers each one via its own per-job delay, not by this
      // sweep noticing it. This ran every 2 minutes, 24/7, which on a metered Redis plan (see
      // notification-scheduler.ts's churn comment) was a meaningful fixed cost on its own, on
      // top of the per-occurrence work it triggered.
      repeat: { every: 10 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
  logger.info('Registered repeatable schedule-processing job (every 10 minutes)');
}
