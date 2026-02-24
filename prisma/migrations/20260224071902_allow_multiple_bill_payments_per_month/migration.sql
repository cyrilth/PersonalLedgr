-- DropIndex
DROP INDEX "BillPayment_recurringBillId_month_year_key";

-- CreateIndex
CREATE INDEX "BillPayment_recurringBillId_month_year_idx" ON "BillPayment"("recurringBillId", "month", "year");
