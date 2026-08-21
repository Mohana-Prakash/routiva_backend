import { prisma } from '../../src/db/prisma';

const TABLES = [
  'audit_logs',
  'notification_jobs',
  'notification_preferences',
  'push_subscriptions',
  'activity_logs',
  'schedule_exceptions',
  'schedule_entries',
  'activities',
  'categories',
  'password_reset_tokens',
  'refresh_sessions',
  'users',
];

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
