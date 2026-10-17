-- Phase 4: review loop. Issues left open after review are stored per segment;
-- segment status gains "reviewed" and "flagged" (status is a plain string).

-- AlterTable
ALTER TABLE "Segment" ADD COLUMN     "reviewIssues" JSONB NOT NULL DEFAULT '[]';
