import { z } from 'zod';

/**
 * Payload for the PoC round trip: minimal, no sensitive data (per the migration plan's
 * "don't put sensitive information into QStash payloads unnecessarily"). Real alarm messages
 * (Phase 3+) will carry only identifiers (activityLogId etc.), never push subscription
 * secrets or user data.
 */
export const qstashTestTriggerSchema = z
  .object({
    note: z.string().trim().max(200).optional(),
  })
  .strict();

export type QStashTestTriggerInput = z.infer<typeof qstashTestTriggerSchema>;
