import IORedis, { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../common/logger';

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    client.on('error', (err) => {
      logger.error({ err }, 'Redis connection error');
    });
  }
  return client;
}

/** Dedicated connection factory for BullMQ, which requires its own connections per queue/worker. */
export function createRedisConnection(): Redis {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
