-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurringBillId" TEXT NOT NULL,
    "transactionId" TEXT,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillPayment_transactionId_key" ON "BillPayment"("transactionId");

-- CreateIndex
CREATE INDEX "BillPayment_recurringBillId_idx" ON "BillPayment"("recurringBillId");

-- CreateIndex
CREATE INDEX "BillPayment_year_month_idx" ON "BillPayment"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BillPayment_recurringBillId_month_year_key" ON "BillPayment"("recurringBillId", "month", "year");

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_recurringBillId_fkey" FOREIGN KEY ("recurringBillId") REFERENCES "RecurringBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
