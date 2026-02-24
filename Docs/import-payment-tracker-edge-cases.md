# Import & Payment Tracker Edge Cases

Edge cases at the intersection of CSV Import reconciliation and the Payment Tracker grid.

---

## 1. Reconciled import then deleted from payment tracker

**Scenario**: User imports a CSV that reconciles a bill payment (replaces the RECURRING transaction with an IMPORT one). Later they go to the payment tracker grid and click to delete that payment.

**Current behavior**: `deleteBillPayment` checks `source === "RECURRING"` to decide whether to delete the transaction or just unlink the BillPayment record. The IMPORT transaction is preserved and only the BillPayment link is removed.

**Status**: Works correctly. No action needed.

---

## 2. Payment tracker shows "overdue" for an already-imported payment

**Scenario**: User imports their bank CSV first (creating plain EXPENSE transactions) and *then* sets up a recurring bill. The payment tracker shows that month as overdue/unpaid because no BillPayment record exists.

**Gap**: `linkTransactionToBill` exists as a server action, but the payment tracker grid's cell click only opens the "record new payment" dialog — there's no "link existing transaction" flow from the grid UI.

**Impact**: Medium-high. Common workflow for users setting up bills after they've already been importing CSVs.

**Possible fix**: Add a "Link Existing" option to the payment dialog that searches for matching EXPENSE transactions in the same month (using `getMatchingTransactions`, which already exists).

---

## 3. Partial reconciliation after manual "link existing" payment

**Scenario**: User records a bill payment via the payment tracker using "link existing transaction" (pointing BillPayment at an imported or manual transaction). Later they import another bank CSV for the same period.

**Gap**: Import reconciliation only looks for `source: "RECURRING"` transactions when building the reconcile lookup. Transactions linked via "link existing" (source = `IMPORT` or `MANUAL`) won't appear as reconciliation candidates, so the import won't detect them and may create a duplicate EXPENSE.

**Impact**: Low — this is a niche sequence of operations. But it could cause double-counted expenses.

**Possible fix**: Expand the reconcile lookup in `detectDuplicates` to also consider transactions that have an associated BillPayment record regardless of source.

---

## 4. Variable-amount bills don't match during reconciliation

**Scenario**: A variable-amount bill is set up as $100 estimated, but the actual bank charge is $102.50. The import reconciliation matches on exact cents, so there's no match.

**Gap**: The imported row comes in as a new EXPENSE. The payment tracker still shows "overdue" for that bill. The user has to manually record/link the payment separately.

**Impact**: Medium. Variable-amount bills (utilities, phone bills) are common and rarely match the estimate exactly.

**Possible fix**: For bills with `isVariableAmount: true`, use a tolerance range (e.g., +/- 20%) when matching amounts in the reconcile lookup. Surface these as lower-confidence reconciliation candidates.

---

## 5. Multiple payments per month for the same bill

**Scenario**: A bill gets paid twice in one month (correction, split payment, or refund + re-payment). The BillPayment table has a unique constraint on `(recurringBillId, month, year)`.

**Gap**: Only one payment can be recorded per bill per month. The import would reconcile with the first occurrence; the second comes in as a new EXPENSE but can't be linked to the same bill.

**Impact**: Low. Rare scenario, but when it happens the data model can't represent it.

**Possible fix**: Would require schema changes — either removing the unique constraint or adding a sequence/index field. Low priority.

---

## 6. Loan/CC reconciliation reflected in payment tracker

**Scenario**: A CSV import reconciles a loan or CC payment (replaces the TRANSFER on the import account with an IMPORT-source TRANSFER). The payment tracker looks for LOAN_PRINCIPAL or positive TRANSFER transactions on the loan/CC account side.

**Current behavior**: The linked transaction on the loan/CC account is preserved and re-linked to the new IMPORT transaction. The payment tracker correctly picks it up.

**Status**: Works correctly. No action needed.

---

## 7. Deleting a reconciled imported transaction

**Scenario**: User imports a CSV that reconciles a bill payment (RECURRING transaction deleted, IMPORT transaction created, BillPayment re-pointed). Later the user deletes the imported transaction.

**Gap**: If the transaction delete cascades to BillPayment (via `onDelete: Cascade` on the relation), the payment record disappears and the tracker shows "overdue" again. The original RECURRING transaction is gone — there's no way to recover it.

**Impact**: Medium. Destructive and non-recoverable, though the user explicitly chose to delete.

**Possible fix**: Show a warning when deleting a transaction that has an associated BillPayment record: "This transaction is linked to a bill payment for [Bill Name] ([Month Year]). Deleting it will also remove the payment record."

---

## Priority Summary

| # | Edge Case | Impact | Effort |
|---|-----------|--------|--------|
| 2 | No "link existing" flow in payment tracker grid | Medium-high | Medium |
| 4 | Variable-amount bills don't fuzzy-match | Medium | Medium |
| 7 | Deleting reconciled transaction loses payment record silently | Medium | Low |
| 3 | "Link existing" payments not detected by import reconciliation | Low | Low |
| 5 | Multiple payments per month not supported | Low | High |
| 1 | Reconciled import deleted from tracker | None | N/A |
| 6 | Loan/CC reconciliation in tracker | None | N/A |
