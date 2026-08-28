import { z } from 'zod';

/**
 * Payload for the PoC round trip: minimal, no sensitive data (per the migration plan's
 * "don't put sensitive information into QStash payloads unnecessarily"). Real alarm messages
 * carry only identifiers (activityLogId etc.), never push subscription secrets or user data —
 * see reminderDeliverSchema below.
 */
export const qstashTestTriggerSchema = z
  .object({
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export type QStashTestTriggerInput = z.infer<typeof qstashTestTriggerSchema>;

/**
 * Body of the QStash message published in notification-scheduler.ts's scheduleStageViaQStash —
 * mirrors ReminderPayload (reminder-delivery.ts) exactly. Validated defensively even though the
 * signature already proves it came from our own publish call, since a signature only proves
 * authenticity, not that the body still matches whatever shape this deployment currently expects.
 */
export const reminderDeliverSchema = z
  .object({
    notificationJobId: z.string().uuid(),
    userId: z.string().uuid(),
    activityLogId: z.string().uuid(),
    activityName: z.string().min(1),
    kind: z.enum(['pre-reminder', 'timed-actionable', 'timeless-actionable', 'end-check']),
    actions: z.array(z.enum(['start', 'complete', 'skip', 'close'])),
  })
  .strict();

export type ReminderDeliverInput = z.infer<typeof reminderDeliverSchema>;
