import { Router } from 'express';
import { prisma } from '../db/prisma';
import { getRedisClient } from '../db/redis';
import { asyncHandler } from '../common/utils/asyncHandler';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'live' } });
});

healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, 'ok' | 'error'> = { database: 'ok', redis: 'ok' };
    let healthy = true;

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      checks.database = 'error';
      healthy = false;
    }

    try {
      const pong = await getRedisClient().ping();
      if (pong !== 'PONG') throw new Error('unexpected redis response');
    } catch {
      checks.redis = 'error';
      healthy = false;
    }

    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: { status: healthy ? 'ready' : 'not_ready', checks },
    });
  }),
);
