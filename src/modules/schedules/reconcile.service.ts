import { DateTime } from 'luxon';
import { logger } from '../../common/logger';
import { prisma } from '../../db/prisma';
import { schedulesService } from './schedules.service';
import { trackingRepository } from '../tracking/tracking.repository';
import { todayInTimezone } from '../../common/utils/time';

function dateStringToDbDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Runs periodically via a QStash schedule (see qstash-reconcile.routes.ts / jobs/scheduler.ts).
 * For every active user: materializes today's (and yesterday's, to catch stragglers whose day
 * just ended) schedule so reminders are queued even if the user never opens the app, then
 * sweeps expired PLANNED logs to MISSED — a label meaning "the window passed without being
 * acted on", not a final verdict. It does NOT touch IN_PROGRESS logs: the system never assumes
 * an activity is completed just because time ran out. The user stays in control —
 * Complete/Skip remain available on a MISSED (and an overrun IN_PROGRESS) log indefinitely, so
 * nothing is silently decided for them. Timeless logs (no fixed slot) use a day-boundary rule
 * instead — they expire once their whole activityDate has passed, since there's no specific end
 * time to compare against. Stateless and safe to run concurrently/repeatedly: all state lives
 * in Postgres, nothing in process memory.
 */
export async function reconcileAllUsers(): Promise<void> {
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
