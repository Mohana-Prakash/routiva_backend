-- AlterTable
ALTER TABLE "schedule_entries" ADD COLUMN     "timeless_reminder_time" TEXT;

-- AlterTable
ALTER TABLE "schedule_exceptions" ADD COLUMN     "timeless_reminder_time" TEXT;
