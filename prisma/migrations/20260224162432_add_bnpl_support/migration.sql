-- AlterEnum
ALTER TYPE "LoanType" ADD VALUE 'BNPL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecurringFrequency" ADD VALUE 'WEEKLY';
ALTER TYPE "RecurringFrequency" ADD VALUE 'BIWEEKLY';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "completedInstallments" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "installmentFrequency" "RecurringFrequency",
ADD COLUMN     "merchantName" TEXT,
ADD COLUMN     "nextPaymentDate" TIMESTAMP(3),
ADD COLUMN     "paymentAccountId" TEXT,
ADD COLUMN     "totalInstallments" INTEGER;
