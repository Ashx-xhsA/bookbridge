-- AlterTable: track whether a user has edited a term's translation. Extraction
-- never touches rows where userEdited=true or approved=true, preventing the
-- LLM from overwriting curated values when re-scanning.
ALTER TABLE "GlossaryTerm" ADD COLUMN "userEdited" BOOLEAN NOT NULL DEFAULT false;
