import { logger } from '../common/logger';
import { getApiBaseUrl, getQStashClient, isQStashPublishingConfigured } from '../common/qstash/qstash.util';

const RECONCILE_SCHEDULE_ID = 'reconcile-all-users';

/**
 * Registers the recurring schedule-reconciliation job with QStash (materializes today's
 * occurrences, sweeps expired PLANNED logs to MISSED — see reconcile.service.ts). Safe to call
 * on every boot: passing the same scheduleId updates the existing schedule in place instead of
 * creating a duplicate one alongside it.
 *
 * A silent no-op when QStash isn't configured (local dev — API_BASE_URL is deliberately unset
 * there, since QStash cannot reach localhost, see qstash.util.ts): local dev simply doesn't get
 * schedule reconciliation, same as reminder scheduling in that environment.
 */
export async function registerReconcileSchedule(): Promise<void> {
  const baseUrl = getApiBaseUrl();
  if (!isQStashPublishingConfigured() || !baseUrl) {
    logger.debug('Skipping schedule-reconciliation registration — QStash is not configured in this environment');
    return;
  }

  await getQStashClient().schedules.create({
    scheduleId: RECONCILE_SCHEDULE_ID,
    destination: `${baseUrl}/qstash/reconcile`,
    cron: '*/10 * * * *',
    retries: 3,
  });

  logger.info('Registered schedule-reconciliation job with QStash (every 10 minutes)');
}
