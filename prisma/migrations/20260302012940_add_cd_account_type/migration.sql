-- AlterEnum
ALTER TYPE "AccountType" ADD VALUE 'CD';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "autoRenew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maturityDate" TIMESTAMP(3),
ADD COLUMN     "termMonths" INTEGER;
