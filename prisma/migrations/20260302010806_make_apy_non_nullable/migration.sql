/*
  Warnings:

  - Made the column `apy` on table `Account` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill NULL values to 0 before making the column NOT NULL
UPDATE "Account" SET "apy" = 0 WHERE "apy" IS NULL;

-- AlterTable
ALTER TABLE "Account" ALTER COLUMN "apy" SET NOT NULL,
ALTER COLUMN "apy" SET DEFAULT 0;
