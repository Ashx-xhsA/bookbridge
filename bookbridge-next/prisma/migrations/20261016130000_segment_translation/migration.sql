-- Phase 2: translation is stored per Segment; the chapter-level column from
-- the v1 pipeline goes away. Aliases feed exact glossary matching.

-- AlterTable
ALTER TABLE "Chapter" DROP COLUMN "translation";

-- AlterTable
ALTER TABLE "GlossaryTerm" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
