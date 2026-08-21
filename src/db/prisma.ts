import { PrismaClient } from '@prisma/client';
import { isProduction } from '../config/env';

export const prisma = new PrismaClient({
  log: isProduction ? ['error', 'warn'] : ['warn', 'error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
