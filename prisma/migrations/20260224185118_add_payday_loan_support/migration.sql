-- AlterEnum
ALTER TYPE "LoanType" ADD VALUE 'PAYDAY';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "feePerHundred" DECIMAL(8,2),
ADD COLUMN     "lenderName" TEXT,
ADD COLUMN     "termDays" INTEGER;
