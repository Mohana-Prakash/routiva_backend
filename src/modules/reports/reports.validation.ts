import { z } from 'zod';
import { isValidDateString } from '../../common/utils/time';

const MAX_RANGE_DAYS = 366;

export const reportRangeQuerySchema = z
  .object({
    from: z.string().refine(isValidDateString, 'Must be YYYY-MM-DD'),
    to: z.string().refine(isValidDateString, 'Must be YYYY-MM-DD'),
    // Accepted for forward-compatibility (frontend always sends it, types/reports.ts) but not
    // currently used: activity_logs.activity_date is already bucketed to the correct local
    // calendar day at materialization time, so no further timezone adjustment is needed here.
    timezone: z.string().max(64).optional(),
  })
  .strict()
  .refine((v) => v.from <= v.to, { message: 'from must not be after to', path: ['from'] })
  .refine(
    (v) => {
      const days = (new Date(v.to).getTime() - new Date(v.from).getTime()) / (1000 * 60 * 60 * 24);
      return days <= MAX_RANGE_DAYS;
    },
    { message: `Range cannot exceed ${MAX_RANGE_DAYS} days`, path: ['to'] },
  );

export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;
