-- Phase 3: book bible. Aliases become their own GlossaryTerm rows (with their
-- own translation) pointing at the entity they name; the string-array column
-- from Phase 2 goes away (never applied to a populated database).
-- BookBible keeps review status (NONE/DRAFT/CONFIRMED) apart from scan status
-- (IDLE/SCANNING/FAILED) so a re-scan never disables the current bible.

-- CreateEnum
CREATE TYPE "BibleStatus" AS ENUM ('NONE', 'DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('IDLE', 'SCANNING', 'FAILED');

-- AlterTable
ALTER TABLE "GlossaryTerm" DROP COLUMN "aliases",
ADD COLUMN     "aliasOfId" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "mentions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "voice" TEXT;

-- CreateTable
CREATE TABLE "BookBible" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "styleGuide" TEXT NOT NULL DEFAULT '',
    "styleGuideEdited" BOOLEAN NOT NULL DEFAULT false,
    "status" "BibleStatus" NOT NULL DEFAULT 'NONE',
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'IDLE',
    "scanStartedAt" TIMESTAMP(3),
    "jobId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookBible_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GlossaryTerm_aliasOfId_idx" ON "GlossaryTerm"("aliasOfId");

-- CreateIndex
CREATE UNIQUE INDEX "BookBible_projectId_key" ON "BookBible"("projectId");

-- AddForeignKey
ALTER TABLE "GlossaryTerm" ADD CONSTRAINT "GlossaryTerm_aliasOfId_fkey" FOREIGN KEY ("aliasOfId") REFERENCES "GlossaryTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookBible" ADD CONSTRAINT "BookBible_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
