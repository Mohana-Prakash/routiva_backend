import { Queue } from 'bullmq';
import { createRedisConnection } from '../../db/redis';

export const QUEUE_NAMES = {
  scheduleProcessing: 'schedule-processing',
  cleanup: 'cleanup',
} as const;

let scheduleProcessingQueue: Queue | null = null;
let cleanupQueue: Queue | null = null;

export function getScheduleProcessingQueue(): Queue {
  if (!scheduleProcessingQueue) {
    scheduleProcessingQueue = new Queue(QUEUE_NAMES.scheduleProcessing, {
      connection: createRedisConnection(),
      defaultJobOptions: { attempts: 3, removeOnComplete: { age: 60 * 60 * 24 }, removeOnFail: { age: 60 * 60 * 24 * 7 } },
    });
  }
  return scheduleProcessingQueue;
}

export function getCleanupQueue(): Queue {
  if (!cleanupQueue) {
    cleanupQueue = new Queue(QUEUE_NAMES.cleanup, {
      connection: createRedisConnection(),
      defaultJobOptions: { attempts: 3, removeOnComplete: { age: 60 * 60 * 24 }, removeOnFail: { age: 60 * 60 * 24 * 7 } },
    });
  }
  return cleanupQueue;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([scheduleProcessingQueue?.close(), cleanupQueue?.close()].filter(Boolean));
}
