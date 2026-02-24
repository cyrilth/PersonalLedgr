# Payment Ledger — Implementation Checklist

## 1. Schema & Migration
- [ ] Add `BillPayment` model to `prisma/schema.prisma`
- [ ] Add `billPayments` relation to `RecurringBill` model
- [ ] Add `billPayment` relation to `Transaction` model
- [ ] Run `pnpm exec prisma migrate dev` to create migration
- [ ] Run `pnpm exec prisma generate` to update Prisma Client

## 2. Server Actions
- [ ] Create `src/actions/bill-payments.ts`
- [ ] Implement `getBillPayments(startMonth, startYear, endMonth, endYear)`
- [ ] Implement `recordBillPayment(data)` with atomic transaction + balance update
- [ ] Implement `deleteBillPayment(id)` with balance reversal

## 3. Components
- [ ] Create `src/components/recurring/payment-ledger.tsx` (multi-month grid)
- [ ] Create `src/components/recurring/payment-dialog.tsx` (record payment dialog)

## 4. Page Integration
- [ ] Add Tabs to `/recurring` page with Bills / Calendar / Ledger tabs
- [ ] Wire up ledger data fetching

## 5. Cron Job Update
- [ ] Update `cron/src/jobs/recurring-bills.ts` to create BillPayment for fixed bills

## 6. Variable Bill Confirmation Update
- [ ] Update `confirmVariableBill` in `src/actions/recurring.ts` to create BillPayment

## 7. Testing
- [ ] Verify schema migration applies cleanly
- [ ] Test recording a payment (creates transaction + BillPayment)
- [ ] Test deleting a payment (reverses balance, removes records)
- [ ] Test ledger grid displays correct cell states
- [ ] Test cron auto-creates BillPayment for fixed bills
