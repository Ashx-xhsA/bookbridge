-- Phase 3: book bible. Aliases become their own GlossaryTerm rows (with their
-- own translation) pointing at the entity they name; the string-array column
-- from Phase 2 goes away (never applied to a populated database).

-- CreateEnum
CREATE TYPE "BibleStatus" AS ENUM ('SCANNING', 'DRAFT', 'CONFIRMED', 'FAILED');

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
    "status" "BibleStatus" NOT NULL DEFAULT 'SCANNING',
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
