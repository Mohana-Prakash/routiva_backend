import { DateTime } from 'luxon';
import { logger } from '../../common/logger';
import { getNotificationQueue } from '../../jobs/queues';
import { notificationsRepository } from './notifications.repository';
import type { RenderedOccurrence } from '../schedules/schedules.types';

export type ReminderKind = 'pre-reminder' | 'timed-actionable' | 'timeless-actionable';
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
    const actionable: ReminderStage = {
      kind: 'timed-actionable',
      notifyAt: startAt,
      actions: ['start', 'complete', 'skip'],
    };
    if (occurrence.alarmOffsetMinutes <= 0) return [actionable];
    // Two notifications for a timed activity with a lead time: a plain heads-up before it
    // starts (no actions — nothing is actionable yet, it hasn't started), then a second,
    // actionable one exactly at start time (Start/Complete/Skip, actionable straight from the
    // notification — see worker/index.js's notificationclick handler).
    return [
      { kind: 'pre-reminder', notifyAt: startAt.minus({ minutes: occurrence.alarmOffsetMinutes }), actions: [] },
      actionable,
    ];
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

  const jobKey = `${userId}:${occurrence.occurrenceKey}:${occurrence.alarmOffsetMinutes}:${stage.kind}`;
  const job = await notificationsRepository.upsertJob({
    userId,
    activityLogId,
    jobKey,
    scheduledAt: notifyAt.toJSDate(),
  });

  const queue = getNotificationQueue();
  const delayMs = Math.max(0, notifyAt.toMillis() - Date.now());

  try {
    await queue.remove(jobKey);
  } catch {
    // no-op: job may not exist yet
  }

  await queue.add(
    'send-reminder',
    {
      notificationJobId: job.id,
      userId,
      activityLogId,
      activityName: occurrence.activityName,
      kind: stage.kind,
      actions: stage.actions,
    },
    { jobId: jobKey, delay: delayMs },
  );

  logger.debug({ userId, jobKey, delayMs, kind: stage.kind }, 'Notification reminder scheduled');
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
  // The DB row is the source of truth: the worker re-checks job status before sending, so
  // marking these CANCELLED here is sufficient even though the BullMQ-queued job (keyed by
  // jobKey, not activityLogId) isn't individually removed from Redis.
  await notificationsRepository.cancelJobsForActivityLogIds(activityLogIds);
}
