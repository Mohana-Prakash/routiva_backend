import { DateTime } from 'luxon';
import { logger } from '../../common/logger';
import { notificationsRepository } from './notifications.repository';
import { getApiBaseUrl, getQStashClient, isQStashPublishingConfigured } from '../../common/qstash/qstash.util';
import type { ReminderPayload } from './reminder-delivery';
import type { RenderedOccurrence } from '../schedules/schedules.types';

export type ReminderKind = 'pre-reminder' | 'timed-actionable' | 'timeless-actionable' | 'end-check';
export type ReminderAction = 'start' | 'complete' | 'skip' | 'close';

/**
 * Applies the quiet-hours policy: DELAY until quiet hours end (rather than suppress),
 * so alarms still arrive, just not during the user's configured quiet window.
 */
function applyQuietHours(notifyAt: DateTime, timezone: string, quietStart: string, quietEnd: string): DateTime {
  const local = notifyAt.setZone(timezone);
  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);

  const startOfDay = local.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
  let endOfWindow = local.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });

  const wraps = endOfWindow <= startOfDay;
  const inWindow = wraps
    ? local >= startOfDay || local < endOfWindow
    : local >= startOfDay && local < endOfWindow;

  if (!inWindow) return notifyAt;

  if (wraps && local < endOfWindow) {
    // already past midnight, quiet window ends later today
  } else if (wraps) {
    // started today, ends tomorrow
    endOfWindow = endOfWindow.plus({ days: 1 });
  }

  return endOfWindow;
}

interface ReminderStage {
  kind: ReminderKind;
  notifyAt: DateTime;
  actions: ReminderAction[];
}

/** Builds the stage(s) to schedule for one occurrence — see the file-level doc comment. */
function buildStages(occurrence: RenderedOccurrence): ReminderStage[] {
  if (occurrence.plannedStartUtc) {
    const startAt = DateTime.fromJSDate(occurrence.plannedStartUtc);
    // Most browsers cap a notification at 2 visible action buttons (extras are silently
    // dropped) — Start + Skip is the pair that matters the moment it begins; Complete without
    // ever starting is still reachable by opening the app, or via the end-check stage below if
    // the window closes without action.
    const actionable: ReminderStage = {
      kind: 'timed-actionable',
      notifyAt: startAt,
      actions: ['start', 'skip'],
    };
    const stages: ReminderStage[] = occurrence.alarmOffsetMinutes <= 0
      ? [actionable]
      : [
          // Two notifications for a timed activity with a lead time: a plain heads-up before
          // it starts (no actions — nothing is actionable yet, it hasn't started), then a
          // second, actionable one exactly at start time — see worker/index.js's
          // notificationclick handler.
          { kind: 'pre-reminder', notifyAt: startAt.minus({ minutes: occurrence.alarmOffsetMinutes }), actions: [] },
          actionable,
        ];

    if (occurrence.plannedEndUtc) {
      // A third check right at the planned end: the system never assumes an outcome just
      // because time ran out (see trackingService), so instead of staying silent it nudges —
      // "did you get to this?" if it was never started, or "time's up" if it's still running.
      // The actions here are placeholders; the delivery side (reminder-delivery.ts) recomputes
      // them from the log's actual status at delivery time, since that can only be known then.
      stages.push({ kind: 'end-check', notifyAt: DateTime.fromJSDate(occurrence.plannedEndUtc), actions: [] });
    }

    return stages;
  }

  if (occurrence.reminderAtUtc) {
    // Timeless: no Start button — there's no timer to watch, so it's just "did you do it".
    return [
      {
        kind: 'timeless-actionable',
        notifyAt: DateTime.fromJSDate(occurrence.reminderAtUtc),
        actions: ['complete', 'close'],
      },
    ];
  }

  return [];
}

type SchedulablePayload = Omit<ReminderPayload, 'notificationJobId'>;

async function scheduleStageViaQStash(
  jobKey: string,
  notifyAt: DateTime,
  payload: SchedulablePayload,
): Promise<void> {
  const client = getQStashClient();

  // This runs on every schedule read (dashboard load, tab refocus) and every reconciliation
  // sweep, almost always for a reminder that hasn't actually changed since last time. If
  // Postgres already has this exact target time recorded and QStash confirms the message is
  // still really queued, there's nothing to do — avoids deleting and republishing an identical
  // message on every call.
  const existing = await notificationsRepository.findJobByKey(jobKey);
  if (
    existing &&
    existing.status === 'SCHEDULED' &&
    existing.scheduledAt.getTime() === notifyAt.toMillis() &&
    existing.qstashMessageId
  ) {
    try {
      await client.messages.get(existing.qstashMessageId);
      return; // unchanged and still queued — nothing to do
    } catch {
      // Gone (delivered, expired, or manually removed) — fall through and reschedule.
    }
  }

  // Replace, not append: an unchanged-but-since-superseded message (or one from before this
  // reschedule) must not be left behind to fire a second, stale notification later.
  if (existing?.qstashMessageId) {
    try {
      await client.messages.delete(existing.qstashMessageId);
    } catch (err) {
      logger.warn({ err, jobKey }, 'Failed to delete previous QStash message before rescheduling (may already be gone)');
    }
  }

  const job = await notificationsRepository.upsertJob({
    userId: payload.userId,
    activityLogId: payload.activityLogId,
    jobKey,
    scheduledAt: notifyAt.toJSDate(),
  });

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    // shouldUseQStash() already checked this, but guard against a race (env changing between
    // the check and here is not realistic, but a null baseUrl must never silently proceed).
    throw new Error('QStash callback base URL is not configured');
  }

  const result = await client.publishJSON({
    url: `${baseUrl}/notifications/qstash/deliver`,
    body: { ...payload, notificationJobId: job.id },
    notBefore: Math.floor(notifyAt.toMillis() / 1000),
    retries: 3,
  });

  await notificationsRepository.setQStashMessageId(job.id, result.messageId);

  logger.debug(
    { userId: payload.userId, jobKey, notifyAt: notifyAt.toISO(), kind: payload.kind, messageId: result.messageId },
    'Reminder scheduled via QStash',
  );
}

async function scheduleStage(
  userId: string,
  timezone: string,
  occurrence: RenderedOccurrence,
  activityLogId: string,
  stage: ReminderStage,
  preferences: { quietHoursEnabled: boolean; quietHoursStart: string | null; quietHoursEnd: string | null },
): Promise<void> {
  let notifyAt = stage.notifyAt;
  if (notifyAt.toMillis() <= Date.now()) {
    // Do not send stale reminders for windows that have already opened/passed.
    return;
  }
  if (preferences.quietHoursEnabled && preferences.quietHoursStart && preferences.quietHoursEnd) {
    notifyAt = applyQuietHours(notifyAt, timezone, preferences.quietHoursStart, preferences.quietHoursEnd);
  }

  // QStash cannot reach a local machine (see qstash.util.ts), so local dev has no publicly
  // reachable callback URL to give it — API_BASE_URL is deliberately left unset there. This is
  // a silent no-op rather than an error: local dev simply doesn't get reminder scheduling,
  // same as it wouldn't be able to receive any other externally-triggered webhook either.
  if (!isQStashPublishingConfigured() || !getApiBaseUrl()) {
    logger.debug({ userId, occurrenceKey: occurrence.occurrenceKey }, 'Skipping reminder scheduling — QStash is not configured in this environment');
    return;
  }

  const jobKey = `${userId}:${occurrence.occurrenceKey}:${occurrence.alarmOffsetMinutes}:${stage.kind}`;
  const payload: SchedulablePayload = {
    userId,
    activityLogId,
    activityName: occurrence.activityName,
    kind: stage.kind,
    actions: stage.actions,
  };

  await scheduleStageViaQStash(jobKey, notifyAt, payload);
}

export async function scheduleOrUpdateReminder(
  userId: string,
  timezone: string,
  occurrence: RenderedOccurrence,
  activityLogId: string,
): Promise<void> {
  if (!occurrence.alarmEnabled) return;

  const stages = buildStages(occurrence);
  if (stages.length === 0) return; // e.g. timeless with no reminder time configured

  const preferences = await notificationsRepository.getOrCreatePreferences(userId);
  if (!preferences.pushEnabled) return;

  for (const stage of stages) {
    await scheduleStage(userId, timezone, occurrence, activityLogId, stage, preferences);
  }
}

export async function cancelRemindersForActivityLogs(activityLogIds: string[]): Promise<void> {
  if (activityLogIds.length === 0) return;
  // The DB row is the source of truth: the delivery side re-checks job status before sending,
  // so marking these CANCELLED here is sufficient even though the underlying queued job/message
  // isn't guaranteed to be removed below (best-effort only).
  const cancelled = await notificationsRepository.cancelJobsForActivityLogIds(activityLogIds);

  const withQStashMessage = cancelled.filter(
    (job): job is typeof job & { qstashMessageId: string } => !!job.qstashMessageId,
  );
  if (withQStashMessage.length > 0 && isQStashPublishingConfigured()) {
    const client = getQStashClient();
    await Promise.all(
      withQStashMessage.map((job) =>
        client.messages.delete(job.qstashMessageId).catch((err) => {
          // Not user-visible either way — the status flip above already makes delivery a
          // no-op — this just saves QStash the wasted round trip.
          logger.warn({ err, notificationJobId: job.id }, 'Failed to delete cancelled QStash message');
        }),
      ),
    );
  }
}
