-- AlterTable
ALTER TABLE "schedule_entries" ALTER COLUMN "start_time" DROP NOT NULL,
ALTER COLUMN "end_time" DROP NOT NULL;
