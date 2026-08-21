import { Queue } from 'bullmq';
import { createRedisConnection } from '../../db/redis';

export const QUEUE_NAMES = {
  notifications: 'notifications',
  scheduleProcessing: 'schedule-processing',
  cleanup: 'cleanup',
} as const;

let notificationQueue: Queue | null = null;
let scheduleProcessingQueue: Queue | null = null;
let cleanupQueue: Queue | null = null;

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

export function getNotificationQueue(): Queue {
  if (!notificationQueue) {
    notificationQueue = new Queue(QUEUE_NAMES.notifications, {
      connection: createRedisConnection(),
      defaultJobOptions,
    });
  }
  return notificationQueue;
}

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
  await Promise.all([notificationQueue?.close(), scheduleProcessingQueue?.close(), cleanupQueue?.close()].filter(Boolean));
}
