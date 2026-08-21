import { disconnectPrisma } from '../../src/db/prisma';
import { disconnectRedis } from '../../src/db/redis';
import { closeQueues } from '../../src/jobs/queues';

export async function closeAll(): Promise<void> {
  await closeQueues();
  await disconnectRedis();
  await disconnectPrisma();
}
