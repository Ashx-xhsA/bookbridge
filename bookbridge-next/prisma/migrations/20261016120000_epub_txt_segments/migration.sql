-- Phase 1 (EPUB/TXT input). Decision 2026-10-16: existing projects were all
-- built from PDFs with page-based chapters and are deleted rather than
-- migrated. Chapters, jobs, glossary terms cascade from Project.
DELETE FROM "Project";

-- AlterTable
ALTER TABLE "Chapter" DROP COLUMN "endPage",
DROP COLUMN "pageCount",
DROP COLUMN "sourceContent",
DROP COLUMN "startPage";

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "translation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Segment_chapterId_index_key" ON "Segment"("chapterId", "index");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

