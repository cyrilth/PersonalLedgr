-- AlterTable
-- Phased repayment for student/personal loans (Option B): deferment +
-- interest-only phases run BEFORE the regular amortization term.
ALTER TABLE "Loan" ADD COLUMN     "defermentMonths" INTEGER,
ADD COLUMN     "interestOnlyMonths" INTEGER,
ADD COLUMN     "lastDefermentAccrual" TIMESTAMP(3),
ADD COLUMN     "subsidized" BOOLEAN NOT NULL DEFAULT false;
