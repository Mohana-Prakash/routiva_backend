import { DateTime } from 'luxon';
import { logger } from '../../common/logger';
import { getNotificationQueue } from '../../jobs/queues';
import { notificationsRepository } from './notifications.repository';
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
      // The actions here are placeholders; notificationWorker.ts recomputes them from the
      // log's actual status at delivery time, since that can only be known then, not now.
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
  const queue = getNotificationQueue();

  // This runs on every schedule read (dashboard load, tab refocus) and every reconciliation
  // sweep (every 2 minutes), almost always for a reminder that hasn't actually changed since
  // last time. Recreating the BullMQ job unconditionally was burning a large, steadily growing
  // share of the account's monthly Redis command budget on pure churn. If Postgres already has
  // this exact target time recorded, do one cheap Redis read to confirm the job is still really
  // there (self-healing if it isn't — e.g. Redis data was cleared) instead of unconditionally
  // deleting and recreating it.
  const existing = await notificationsRepository.findJobByKey(jobKey);
  if (existing && existing.status === 'SCHEDULED' && existing.scheduledAt.getTime() === notifyAt.toMillis()) {
    const stillQueued = await queue.getJob(existing.id);
    if (stillQueued) return;
  }

  const job = await notificationsRepository.upsertJob({
    userId,
    activityLogId,
    jobKey,
    scheduledAt: notifyAt.toJSDate(),
  });

  const delayMs = Math.max(0, notifyAt.toMillis() - Date.now());

  // BullMQ's jobId must not contain ":" (throws "Custom Id cannot contain :") — jobKey does,
  // by design, so it can't be reused here directly. job.id (a plain UUID from the upsert above,
  // stable across re-scheduling the same occurrence+stage since it's keyed on jobKey) is used
  // instead; it's just as good a dedupe/replace key for the BullMQ side.
  try {
    await queue.remove(job.id);
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
    { jobId: job.id, delay: delayMs },
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
