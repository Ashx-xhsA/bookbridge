-- AlterEnum: add async status vocabulary (PENDING → RUNNING → SUCCEEDED)
-- Old values (QUEUED/PROCESSING/COMPLETED) are kept for the parse-tracking
-- rows created by /api/upload; translation jobs now use the new values.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'RUNNING';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'SUCCEEDED';

-- AlterTable: store translated output on the job row so the async poller can
-- read it without a second Worker round-trip.
ALTER TABLE "TranslationJob" ADD COLUMN "translatedContent" TEXT;
