# Logic Review Required Changes

Reviewed by: Codex
Review date: 2026-06-01

This review focused on personal-finance correctness for loans, credit-card APR, recurring bills, account balances, and payment due-date flows. I stopped before making code changes, per user request, and recorded the required fixes here.

## Required Fixes

### 1. Standard loan payment interest is overstated by 100x

Files:
- `src/actions/loan-payments.ts`
- `src/actions/__tests__/loan-payments.test.ts`

Problem:
`recordLoanPayment()` treats stored loan `interestRate` as if it is already a decimal fraction:

```ts
const monthlyInterest = round2(loanBalance * annualRate / 12)
```

The UI and pure calculation helpers use percentage input, for example `6` means `6%`. With the current formula, a $200,000 loan at `6` calculates monthly interest as `$100,000` instead of `$1,000`.

Required change:

```ts
const monthlyInterest = round2(loanBalance * (annualRate / 100) / 12)
```

Test updates:
- Change mocked standard loan rates from decimal fractions like `0.06` to percentages like `6`.
- Keep expected monthly interest for `$200,000 at 6%` as `$1,000`.
- Add a regression test proving `interestRate: 6` produces `$1,000`, not `$100,000`.

### 2. BNPL cron interest split has the same APR scaling bug

Files:
- `cron/src/jobs/bnpl-payments.ts`
- `cron/src/jobs/__tests__/bnpl-payments.test.ts`

Problem:
BNPL auto-payments with interest use:

```ts
const monthlyInterest = round2(loanBalance * annualRate / 12)
```

If BNPL APR is entered as `12`, it is treated as `1200%`.

Required change:

```ts
const monthlyInterest = round2(loanBalance * (annualRate / 100) / 12)
```

Test updates:
- Add or update a BNPL-with-interest case where `interestRate: 12` and a `$1,200` balance gives `$12` monthly interest.

### 3. Credit-card daily APR accrual is understated by 100x

Files:
- `cron/src/jobs/interest-cc.ts`
- `cron/src/jobs/__tests__/interest-cc.test.ts`
- Related reference: `src/actions/apr-rates.ts`
- Related reference: `src/components/accounts/apr-rate-manager.tsx`

Problem:
Credit-card APR rates are stored as decimal fractions. The UI converts `24.99%` to `0.2499`, and `createAccount()` also stores purchase APR as `purchaseApr / 100`.

But the credit-card cron job calculates:

```ts
const dailyRate = effectiveApr.div(new Decimal(100)).div(new Decimal(365))
```

For stored `0.2499`, this becomes `0.2499 / 100 / 365`, which is 100x too low.

Required change:

```ts
const dailyRate = effectiveApr.div(new Decimal(365))
```

Also update comments/logs that currently describe APR as `APR / 100 / 365`.

Test updates:
- Update cron tests to use stored APR fractions, for example `0.2499` for `24.99%`.
- Expected daily interest for `$100 at 24.99%` should be:

```ts
new Decimal(100).mul(new Decimal(0.2499).div(365))
```

### 4. Recurring bill dates can overflow into the wrong month

Files:
- `src/actions/recurring.ts`
- `cron/src/jobs/recurring-bills.ts`
- `src/actions/__tests__/recurring.test.ts`
- `cron/src/jobs/__tests__/recurring-bills.test.ts`

Problem:
Several monthly date calculations use JavaScript date overflow directly:

```ts
new Date(year, month, dayOfMonth)
new Date(year, month + 1, day)
```

For a bill due on the 31st, months without 31 days can roll into the following month. Example: February 31 becomes March 3 in non-leap years. That can skip February's due date and distort payment tracking.

Required change:
Add a shared helper or local helper that clamps to the last day of the target month:

```ts
function dateInMonthClamped(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDay))
}
```

Use it when creating or advancing monthly, quarterly, and annual recurring bill due dates.

Test updates:
- Monthly bill due on day `31`, advancing from January, should produce February 28 or February 29 depending on year.
- Quarterly and annual recurrence should also clamp to the target month.

### 5. Account update can create balance drift

Files:
- `src/actions/accounts.ts`
- `src/actions/__tests__/accounts.test.ts`

Problem:
`updateAccount()` directly overwrites `account.balance`, but it does not create or adjust a transaction to explain the new balance. Since `recalculateBalance()` sums transactions, editing an account balance can immediately create drift.

Required change options:
- Preferred: when balance changes, create a system adjustment transaction for the delta inside the same transaction as the account update.
- Alternative: remove direct balance editing for accounts that have transaction history, and require adjustment transactions.

Test updates:
- Updating account balance from `$1,000` to `$1,250` should create a `$250` system adjustment transaction or otherwise keep recalculation drift at zero.
- Updating metadata only should not create an adjustment.

### 6. Bill payment recording does not verify payment account ownership

Files:
- `src/actions/bill-payments.ts`
- `src/actions/__tests__/bill-payments.test.ts`

Problem:
`recordBillPayment()` verifies the recurring bill belongs to the user, but it accepts `accountId` from the caller and uses it for the transaction and balance update without verifying that the account also belongs to the user.

Required change:
Before the transaction, verify:

```ts
const account = await prisma.account.findFirst({
  where: { id: data.accountId, userId, isActive: true },
})
if (!account) throw new Error("Account not found")
```

Test updates:
- Recording a bill payment with another user's account should throw.
- Recording with an inactive or missing account should throw.

### 7. Recurring bill create/update does not verify account ownership

Files:
- `src/actions/recurring.ts`
- `src/actions/__tests__/recurring.test.ts`

Problem:
`createRecurringBill()` and `updateRecurringBill()` accept `accountId` but do not verify the account belongs to the authenticated user.

Required change:
- On create, verify `data.accountId` belongs to `userId`.
- On update, if `data.accountId` is provided, verify it belongs to `userId`.

Test updates:
- Creating a recurring bill with another user's account should throw.
- Moving a recurring bill to another user's account should throw.

### 8. Loan payment does not cap principal at outstanding loan balance

Files:
- `src/actions/loan-payments.ts`
- `src/actions/__tests__/loan-payments.test.ts`

Problem:
For standard loans and BNPL, a large payment can increment the loan account above zero. That creates a positive asset balance for a paid-off liability unless manually fixed.

Required change:
Cap principal to the outstanding balance:

```ts
principalAmount = Math.min(principalAmount, loanBalance)
```

If the user pays more than principal plus interest, either:
- reject the overpayment, or
- apply only the payoff amount and return the accepted amount.

Also deactivate or mark the loan paid when the updated balance reaches zero.

Test updates:
- Paying `$2,000` on a loan with `$1,000` remaining should not make the loan account positive.

## Additional Follow-Up Review Areas

These areas should be reviewed after the required fixes:

- Date parsing for HTML date strings such as `YYYY-MM-DD`; mixed local/UTC parsing can shift due dates near timezone boundaries.
- Import duplicate detection and balance updates for CSV imports.
- Transfer deletion behavior when one side is linked to bill or loan metadata.
- Credit-card interest accrual basis: the current job accrues on original expense transactions rather than true outstanding daily balance.

## Suggested Verification

Run these after implementing the fixes:

```bash
pnpm test
pnpm lint
pnpm build
```

If touching cron code, run the cron job tests directly as well:

```bash
pnpm vitest run cron/src/jobs/__tests__
```
