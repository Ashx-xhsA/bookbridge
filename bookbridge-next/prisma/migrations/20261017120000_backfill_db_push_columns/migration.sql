-- Columns that were in schema.prisma but only ever applied with `prisma db push`,
-- never through a migration. A database built from the migrations lacks them,
-- and every query on User (upload, settings) fails.
-- IF NOT EXISTS keeps this safe on a database that already has them.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "apiKey" TEXT,
ADD COLUMN IF NOT EXISTS "apiProvider" TEXT DEFAULT 'openai',
ADD COLUMN IF NOT EXISTS "apiBaseUrl" TEXT,
ADD COLUMN IF NOT EXISTS "freeCharsUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Chapter" ADD COLUMN IF NOT EXISTS "summary" TEXT;
