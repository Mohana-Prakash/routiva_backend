import { disconnectPrisma } from '../../src/db/prisma';

export async function closeAll(): Promise<void> {
  await disconnectPrisma();
}
