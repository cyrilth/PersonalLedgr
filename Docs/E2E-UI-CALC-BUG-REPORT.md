# E2E UI and Calculation Bug Report

Date: 2026-06-12
Source: Manual Playwright walkthrough using `e2e-testing-data/E2E-TESTING-GUIDE.md`

This report summarizes the bugs found during the browser-driven E2E walkthrough. Use it as a task list for fixing one issue at a time.

## Critical

### 1. Loan and Mortgage Balances Inflate Net Worth

- [x] Fixed loan creation balance normalization for loan and mortgage liabilities.

Expected:
- After creating Car Loan and Home Mortgage, dashboard should show:
  - Assets: `$31,399.51`
  - Liabilities: `$263,350.00`
  - Net Worth: `-$231,950.49`

Actual:
- Dashboard showed:
  - Assets: `$31,399.51`
  - Liabilities: `$262,650.00`
  - Net Worth: `$294,049.51`

Evidence:
- Loan opening balance appeared in recent transactions/payment history as positive income, for example `+$18,000.00 INCOME`.
- This makes debt look like an asset and causes net worth to be massively overstated.

Likely starting areas:
- Fixed in `src/actions/loans.ts`.
- Regression coverage added in `src/actions/__tests__/loans.test.ts`.
- Verified `src/lib/calculations.ts` already computes net worth correctly when liabilities are stored as negative balances.

Acceptance checks:
- Creating a loan with current balance `18000.00` stores/displays it as debt.
- Loan and mortgage balances increase liabilities, not assets.
- Dashboard net worth matches the guide values.
- Opening balance transactions for loan/mortgage do not count as positive income/assets.

Verification:
- `./node_modules/.bin/vitest run src/actions/__tests__/loans.test.ts src/lib/__tests__/calculations.test.ts`
- Existing database rows created before this fix may still contain positive loan balances and should be recreated or corrected before rerunning the guide.

### 2. Credit Card CSV Import Sign Handling Is Reversed

- [x] Fixed credit-card sign inversion defaults for separate debit/credit CSVs.

Expected:
- Importing `import-credit-card-jan.csv` into Visa Rewards should produce:
  - Charges: `-$282.53`
  - Payment: `+$500.00`
  - New Visa balance: `-$132.53`
  - Utilization: `2.65%`

Actual:
- Import preview showed charges as positive and payment as negative.
- Account list showed Visa balance `$567.47`.
- Utilization showed `11%`.
- Reports omitted the expected Visa spending.

Likely starting areas:
- Fixed in `src/components/import/column-mapper.tsx`.
- Regression coverage added in `src/components/import/__tests__/csv-column-mapper.test.tsx`.
- Verified `src/actions/import.ts` already normalizes separate debit/credit columns correctly.

Acceptance checks:
- Credit-card debit rows preview as negative charges.
- Credit-card credit/payment rows preview as positive payments.
- Imported Visa balance becomes `-$132.53`.
- Dashboard utilization becomes `2.65%`.
- Reports include `$282.53` Uncategorized spending and exclude the `$500.00` payment from income.

Verification:
- `./node_modules/.bin/vitest run src/actions/__tests__/import.test.ts src/components/import/__tests__/csv-column-mapper.test.tsx`

## High

### 3. Debt Display Is Inconsistent With Guide

- [x] Fixed debt display in the accounts grid to match the signed balances used by transactions.

Expected:
- Accounts list in the guide expects debt balances to show negative, for example:
  - Visa Rewards: `-$350.00`
  - Car Loan: `-$18,000.00`
  - Home Mortgage: `-$245,000.00`

Actual:
- Accounts list displayed debts as positive:
  - Visa Rewards: `$350.00`
  - Car Loan: `$18,000.00`
  - Home Mortgage: `$245,000.00`

Note:
- Recent transactions did show Visa opening balance as `-$350.00`, so display conventions differ by component.

Likely starting areas:
- Fixed in `src/components/accounts/account-card.tsx`.
- Regression coverage added in `src/components/accounts/__tests__/account-card.test.ts`.

Acceptance checks:
- Debt display is consistent across account list, account detail, dashboard widgets, and transaction tables.
- Product decision is documented: either always show debts as negative or always show owed amount with clear liability labeling.

Verification:
- `./node_modules/.bin/vitest run src/components/accounts/__tests__/account-card.test.ts`

### 4. Date Display Is One Day Early

- [x] Fixed date-only display formatting to avoid UTC timezone drift.

Expected:
- Entering `2026-03-28` should display as `Mar 28, 2026`.
- Recurring bill due day 5 should display as the 5th.

Actual:
- Manual transaction entered as `2026-03-28` displayed as `Mar 27, 2026`.
- Recurring bills displayed one day early:
  - Internet Service due on the 5th displayed `Next due: Jul 4, 2026`.
  - Electric Bill due on the 18th displayed `Jun 17, 2026`.

Likely starting areas:
- Fixed in `src/lib/utils.ts`.
- Regression coverage added in `src/lib/__tests__/utils.test.ts`.
- Server actions still store date-only values as midnight timestamps; shared display utilities now render those timestamps using the intended calendar day.

Acceptance checks:
- Date-only inputs round-trip without timezone shifts.
- CSV dates display on the same calendar day as imported.
- Manual transaction dates display on the same calendar day as entered.
- Recurring bill due dates display on their configured day.

Verification:
- `./node_modules/.bin/vitest run src/lib/__tests__/utils.test.ts`

### 5. Reports Totals Are Wrong After Credit Card Import

- [x] Verified resolved by the credit-card import sign fix.

Expected Jan 1-Mar 31:
- Total Income: `$13,200.00`
- Total Spending: `$2,156.52`
- Net: `$11,043.48`
- Uncategorized spending: `$282.53`

Actual:
- Total Income: `$13,200.00`
- Total Spending: `$1,873.99`
- Net: `$11,326.01`
- Uncategorized Visa spending missing.

Likely starting areas:
- Verified `src/actions/reports.ts` excludes `TRANSFER` and includes only configured income/spending types.
- Verified `src/lib/constants.ts` keeps credit-card payments out of income/spending via `TRANSFER`.
- Whitebox arithmetic against the guide CSV fixtures now matches the expected reports totals.

Acceptance checks:
- Reports match the guide totals after all imports.
- Credit-card payments do not count as income.
- Credit-card charges count as spending.

Verification:
- `./node_modules/.bin/vitest run`
- One-off Decimal script over `e2e-testing-data/*.csv`:
  - Total Income: `$13,200.00`
  - Total Spending: `$2,156.52`
  - Net: `$11,043.48`
  - Uncategorized: `$282.53`

## Medium

### 6. Add Account Dialog Reopens With Stale Values

- [x] Reset Add Account form state when opening a new account dialog.

Expected:
- Clicking Add Account should open a clean form every time.

Actual:
- After creating Visa Rewards, clicking Add Account reopened the form with Visa Rewards values still populated.
- This made it easy to accidentally create the next account with stale values.

Likely starting areas:
- Fixed in `src/components/accounts/account-form.tsx`.
- Regression coverage added in `src/components/accounts/__tests__/account-form.test.tsx`.

Acceptance checks:
- After successful account creation, reopening Add Account shows default empty values.
- Edit Account still opens with the selected account values.

Verification:
- `./node_modules/.bin/vitest run src/components/accounts/__tests__/account-form.test.tsx`

### 7. User2 Add Account Buttons Did Not Open Dialog

- [x] Not reproduced in live browser spot check; both Add Account buttons opened the dialog for a newly registered user.

Expected:
- User2 should be able to create `User2 Checking` from the empty Accounts page.

Actual:
- User2 dashboard and accounts were correctly empty.
- Both Add Account buttons were visible on `/accounts`.
- Clicking either Add Account button did not open the dialog during the test.

Likely starting areas:
- Checked live Docker app with a throwaway user.
- Header Add Account button opened the dialog.
- Empty-state Add Account button opened the dialog.

Acceptance checks:
- New users can open Add Account from the page header and empty state.
- User2 can create `User2 Checking` with `$500.00`.
- Original user still cannot see User2 Checking.

Verification:
- Headless Chrome spot check against `http://localhost:3000/accounts` with user `whitebox-1781238100889@test.local`.
- Result: `header_button_dialog=OK`, `empty_state_button_dialog=OK`.

## Lower Priority / Test Environment

### 8. Docker Startup Did Not Apply Migrations

- [ ] Ensure Docker startup initializes schema or document the required migration command.

Expected:
- `docker compose up --build` from the guide should allow registration immediately.

Actual:
- Registration failed with HTTP 500.
- App log showed: `The table public.user does not exist in the current database`.
- Applying checked-in migrations fixed registration.

Likely starting areas:
- `Dockerfile`
- `docker-compose.yml`
- README / E2E guide setup instructions
- Optional migration entrypoint script

Acceptance checks:
- Fresh Docker database has required tables before app accepts traffic, or docs explicitly include a migration step.
- Registration works after following documented Docker startup steps.

### 9. Cron Guide Sections Need a UI-Test Strategy

- [ ] Decide how to verify cron-date behavior in E2E.

Issue:
- Cron sections depend on dates like March 1, March 15, April 1, and scheduled job execution.
- These were not verifiable through the live UI on 2026-06-12 without time simulation or direct job execution.

Options:
- Add admin/test-only job run endpoints in development.
- Add deterministic Playwright setup with a frozen app date.
- Keep these as whitebox cron tests rather than manual UI steps.

Acceptance checks:
- Each cron section has a repeatable test path.
- Tests do not depend on waiting for real calendar dates.

## Remaining Fix Order

1. Improve Docker migration startup/docs.
2. Define cron E2E strategy.

## Arithmetic Audit

Verified on 2026-06-12 with one-off Python scripts using `Decimal` and the actual CSV files in `e2e-testing-data/`.

Guide values confirmed correct:
- January checking import: income `$6,500.00`, expenses `$1,026.11`, net `$5,473.89`, balance `$10,473.89`.
- February checking import: income `$6,500.00`, expenses `$699.38`, net `$5,800.62`, balance `$16,274.51`.
- Manual transactions and transfer: checking `$15,399.51`, savings `$11,000.00`.
- Loan setup expected net worth: assets `$31,399.51`, liabilities `$263,350.00`, net worth `-$231,950.49`.
- Car loan first rows: interest `$82.35`, principal `$299.65`, remaining `$17,700.35`, row 2 interest `$80.98`.
- Mortgage first row: interest `$1,327.08`, principal `$252.92`, remaining `$244,747.08`.
- Credit card import expected result: charges `$282.53`, payment `$500.00`, net `$217.47`, Visa balance `-$132.53`, utilization `2.65%`.
- Duplicate import expected checking balance: `$15,326.01`.
- Reports expected summary: income `$13,200.00`, spending `$2,156.52`, net `$11,043.48`.
- Reports category totals: Groceries `$641.15`, Utilities `$453.80`, Dining Out `$170.40`, Gas `$90.45`, Subscriptions `$67.96`, Home Improvement `$234.50`, Healthcare `$148.50`, Shopping `$67.23`, Uncategorized `$282.53`.
- Monthly trend: January spending `$1,382.14`, February spending `$699.38`, March income `$200.00`, March spending `$75.00`.
- February budget actuals: Groceries `$293.65` (`73.41%`), Dining Out `$96.40` (`64.27%`), Utilities `$233.20` (`77.73%`).
- Savings/CD interest examples: Savings `$41.25`, CD `$19.79`.
- BNPL installment schedule: `$50.00` installments produce balances `-$150.00`, `-$100.00`, `-$50.00`, `$0.00`.
- Payday loan: fee `$75.00`, total repayment `$575.00`, equivalent APR `391.07%`, net worth impact `-$75.00`.
- Running balance tracker after recurring/BNPL/payday items: `$15,246.02`, `$15,196.02`, `$15,146.02`, `$14,571.02`.

Comparison to this report:
- The expected values in this report match the independently calculated guide values.
- The report's reported actual values are UI observations from the Playwright walkthrough, not recalculated expectations.
- The February budget values are arithmetic-correct. The guide was updated to create February budgets first and copy them forward to March and April, so the February budget comparison is now reachable.
