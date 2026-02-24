# Payment Ledger Feature Design

## Context

The recurring bills page shows bills and their next due dates, but there's no way to track which bills have actually been paid for each month. The Payment Ledger provides a multi-month grid view showing payment status across time, making it easy to see at a glance which bills are paid, overdue, or upcoming.

## Schema Changes

### New Model: BillPayment

A join table linking recurring bills to their actual payment transactions.

```prisma
model BillPayment {
  id              String        @id @default(cuid())
  month           Int           // 1-12
  year            Int           // e.g. 2026
  amount          Decimal       @db.Decimal(12, 2)
  paidAt          DateTime      @default(now())

  recurringBillId String
  recurringBill   RecurringBill @relation(fields: [recurringBillId], references: [id], onDelete: Cascade)

  transactionId   String?       @unique
  transaction     Transaction?  @relation(fields: [transactionId], references: [id], onDelete: Cascade)

  @@unique([recurringBillId, month, year])
  @@index([recurringBillId])
  @@index([year, month])
}
```

Key decisions:
- `@@unique([recurringBillId, month, year])` — one payment record per bill per month
- `onDelete: Cascade` on transaction FK — deleting the transaction removes the payment record
- `onDelete: Cascade` on bill FK — deleting the bill removes all payment records
- `transactionId` is optional to support manual "mark as paid" without a transaction

### Back-References

- `RecurringBill.billPayments BillPayment[]`
- `Transaction.billPayment BillPayment?`

## Server Actions (`src/actions/bill-payments.ts`)

### `getBillPayments(startMonth, startYear, endMonth, endYear)`
Returns all BillPayment records in the date range, grouped by recurringBillId. Used by the ledger grid to determine cell states.

### `recordBillPayment(data)`
Creates an EXPENSE transaction + BillPayment record atomically:
1. Create transaction (type=EXPENSE, source=RECURRING, negative amount)
2. Update account balance (decrement)
3. Create BillPayment linking bill → transaction

### `deleteBillPayment(id)`
Deletes the BillPayment and its associated transaction. Reverses the balance change.

## Component Design

### `payment-ledger.tsx` — Multi-Month Grid
- 6-column layout: 3 trailing months + current month + 2 future months
- Navigation arrows to shift the window
- Rows: one per active recurring bill
- Cell states:
  - **Paid** (green check): BillPayment exists for that month
  - **Overdue** (red X): month is past, no payment, bill was active
  - **Current unpaid** (amber clock): current month, no payment yet
  - **Future** (gray dash): future month, no payment yet
  - **N/A** (empty): bill doesn't recur in that month (quarterly/annual)

### `payment-dialog.tsx` — Record Payment
- Dialog with pre-filled bill amount (editable for variable bills)
- Account selector (defaults to bill's payment account)
- Date picker (defaults to today)
- Creates transaction + BillPayment on submit

## Page Integration

Add a third tab "Ledger" to the `/recurring` page using shadcn Tabs component. The existing grid/calendar views become the first two tabs.

## Cron Job Updates

When the recurring-bills cron creates a transaction for a **fixed** bill, it also creates a BillPayment record for that month/year. Variable bills get their BillPayment created when the user confirms the amount.

## Edge Cases

- **Quarterly/annual bills**: Only show as due in their actual months (every 3rd/12th month from start)
- **Bill created mid-month**: First payment may be for current month
- **Duplicate prevention**: `@@unique` constraint prevents double-payment records
- **Deleted transactions**: `onDelete: Cascade` auto-removes BillPayment
- **Month boundaries**: Use bill's `dayOfMonth` and frequency to determine which months are "due"
