# PersonalLedgr Sub-Agents Guide

This project includes custom Claude Code sub-agents tailored to common PersonalLedgr development workflows. Sub-agents are specialized AI assistants that run in their own context window with focused prompts and tool access.

## Available Sub-Agents

| Agent | Model | Purpose | Tools |
|---|---|---|---|
| `db-migrate` | Sonnet | Database schema changes & Prisma migrations | Read, Edit, Write, Bash, Grep, Glob |
| `seed-manager` | Sonnet | Seed data creation, modification, and DB reset | Read, Edit, Write, Bash, Grep, Glob |
| `docker-dev` | Haiku | Docker Compose, containers, and infrastructure | Read, Edit, Write, Bash, Grep, Glob |
| `test-transactions` | Sonnet | Transaction integrity verification (read-only) | Read, Bash, Grep, Glob |
| `test-agent` | Sonnet | Unit/integration tests (Jest) & E2E tests (Playwright) | Read, Edit, Write, Bash, Grep, Glob |
| `component-builder` | Inherit | React/Next.js UI components with shadcn/ui | Read, Edit, Write, Bash, Grep, Glob |
| `cron-builder` | Sonnet | Scheduled job creation and maintenance | Read, Edit, Write, Bash, Grep, Glob |
| `csv-import-tester` | Haiku | CSV import system testing (read-only) | Read, Bash, Grep, Glob |

## How to Use Sub-Agents

### Automatic Delegation

Claude automatically delegates tasks to the appropriate sub-agent based on what you ask. Just describe what you need:

```
Add a new "tags" column to the transactions table
```

Claude recognizes this as a schema change and delegates to `db-migrate`.

### Explicit Delegation

You can explicitly request a specific sub-agent:

```
Use the test-transactions agent to verify all transfer pairs are correct
Use the cron-builder agent to create a new monthly report generation job
Use the component-builder agent to build the budget progress bars
```

### Background Execution

For long-running tasks, ask Claude to run the agent in the background:

```
Run the test-transactions agent in the background to check all balances
```

You can continue working while it runs. Press **Ctrl+B** to background a running task.

### Chaining Agents

For multi-step workflows, chain agents sequentially:

```
Use db-migrate to add a "notes" field to transactions, then use seed-manager to update the seed data with sample notes
```

### Parallel Research

For independent investigations, run multiple agents simultaneously:

```
Research the transaction system and the import system in parallel using separate agents
```

---

## Phase-by-Phase Agent Workflow

This section maps every task in `TASKS.md` to the correct sub-agent(s) and shows the recommended workflow — which agent to use, what to tell it, and which agent to chain into next before moving on.

---

### Phase 1: Foundation

#### 1.1 Project Scaffolding

**Agent:** None (main conversation)

This is initial project setup — run these commands directly:

```
Initialize the Next.js 15 project with TypeScript, Tailwind, and App Router.
Install core dependencies: @prisma/client, recharts, lucide-react, next-themes.
Install and configure shadcn/ui with all required components.
Create src/lib/constants.ts and src/lib/utils.ts.
Set output: 'standalone' in next.config.ts.
```

> **Between tasks:** No agents needed yet. Move directly to 1.2.

---

#### 1.2 Theme Setup

**Agent:** `component-builder`

```
Set up the theme system: install next-themes, create theme-provider.tsx with
attribute="class" and defaultTheme="system", create the theme-toggle.tsx component
with sun/moon icons, and configure Tailwind darkMode: "class". Ensure shadcn/ui
CSS variables include both light and dark palettes in globals.css.
```

> **Between tasks:** Verify theme toggles work in the browser manually, then move to 1.3.

---

#### 1.3 Authentication (Better Auth)

**Agent:** Main conversation

```
Set up Better Auth authentication:
- Install better-auth
- Run pnpm exec @better-auth/cli generate to add auth models to Prisma schema
- Rename Better Auth's "account" model to "authAccount" to avoid conflict with finance Account
- Add userId FK to all user-owned finance models (Account, Transaction, Budget, etc.)
- Create src/lib/auth.ts with betterAuth config, Prisma adapter, emailAndPassword enabled
- Create src/lib/auth-client.ts with createAuthClient (signIn, signUp, signOut, useSession)
- Create src/app/api/auth/[...all]/route.ts with toNextJsHandler
- Create login page at src/app/(auth)/login/page.tsx using signIn.email()
- Create registration page at src/app/(auth)/register/page.tsx using signUp.email()
- Create src/middleware.ts using auth.api.getSession() to protect routes
```

**Then chain → `test-agent`**:

```
Write tests for authentication:
- Registration creates user and establishes session
- Login with valid credentials returns session
- Login with invalid credentials returns error
- Middleware redirects unauthenticated users to /login
- Authenticated users redirected away from /login to /
- Each user's data is scoped to their userId
```

> **Between tasks:** Auth working. Move to 1.4.

---

#### 1.4 Docker Setup

**Agent:** `docker-dev`

```
Create the full Docker setup: root Dockerfile with multi-stage Next.js build,
cron/Dockerfile with Node.js Alpine, docker-compose.yml with three services
(app on port 3000, db with PostgreSQL 16 Alpine + healthcheck + persistent volume,
cron depends on db). Create .env.example and .dockerignore.
```

**Then chain → `docker-dev`** to verify:

```
Run docker compose up --build and verify all three containers start.
Check that the app connects to PostgreSQL and the cron container logs startup.
```

> **Between tasks:** All containers running. Move to 1.4.

---

#### 1.5 Database Schema

**Agent:** `db-migrate`

```
Create src/db/index.ts with the PrismaClient singleton.
Create src/db/schema.ts with all enums (accountTypeEnum, transactionTypeEnum,
transactionSourceEnum, loanTypeEnum, recurringFrequencyEnum, interestLogTypeEnum,
aprRateTypeEnum) and all tables (accounts, credit_card_details, apr_rates, loans,
transactions, recurring_bills, budgets, interest_log) with all indexes and constraints
as specified in TASKS.md section 1.4.
```

**Then chain → `db-migrate`** to generate and apply:

```
Run pnpm exec prisma init, define the schema in prisma/schema.prisma,
then run pnpm exec prisma migrate dev --name init. Verify all tables and indexes exist in PostgreSQL.
```

> **Between tasks:** Schema is live. Move to 1.5.

---

#### 1.6 Seed Data

**Agent:** `seed-manager`

```
Create src/db/seed.ts with all demo data from TASKS.md section 1.5:
4 accounts with owners, credit card details for both CCs, APR rates,
3 loans, 6 months of transactions (income, expenses, transfers with
linked_transaction_id, loan payments split into principal/interest,
interest earned/charged), 5 recurring bills (3 fixed, 2 variable),
3 budgets, and interest log entries. Also create src/db/wipe-seed.ts.
Add db:seed and db:wipe scripts to package.json.
```

**Then chain → `seed-manager`** to test:

```
Run pnpm db:wipe && pnpm db:seed and verify all tables populated correctly.
```

**Then chain → `seed-manager`** for the API routes:

```
Create src/app/api/seed/route.ts with POST /api/seed/wipe and POST /api/seed/generate endpoints.
```

**Then chain → `test-transactions`** to verify integrity:

```
Verify all transfer pairs have matching linked_transaction_id.
Check that loan payments are correctly split into principal + interest.
Verify account balances match the sum of their transactions.
```

> **Between tasks:** Seed data verified. Move to 1.6.

---

#### 1.7 Base Layout

**Agent:** `component-builder`

```
Create the base layout: sidebar.tsx with nav links (Dashboard, Transactions,
Accounts, Loans, Recurring Bills, Budgets, Import, Settings) with lucide-react
icons and active link highlighting. Create header.tsx with page title and breadcrumbs.
Create footer.tsx with the short disclaimer text. Create the root layout.tsx
wrapping children with ThemeProvider + sidebar + footer. Create placeholder pages
for all routes.
```

**Then chain → `component-builder`** to verify:

```
Verify navigation works between all pages, the sidebar collapses on mobile,
and dark/light mode toggle works and persists.
```

> **Between tasks:** Layout complete. Move to 1.7.

---

#### 1.8 First-Launch Disclaimer

**Agent:** `component-builder`

```
Create src/components/disclaimer-modal.tsx: full-screen modal shown on first launch,
displays the complete disclaimer text from Docs/DISCLAIMER.md, "I understand and accept"
button, stores acknowledgment in localStorage (personalledgr-disclaimer-accepted: true),
cannot be dismissed without clicking accept. Integrate into root layout.
```

**Then chain → `test-agent`** to write tests:

```
Write component tests for the disclaimer modal: fresh render shows modal,
accepting sets localStorage and hides modal, clearing storage re-shows it.
```

> **Between tasks:** Phase 1 complete. Run `test-agent` to set up Jest + Playwright config before starting Phase 2:

```
Set up Jest with ts-jest, @testing-library/react, jest-environment-jsdom.
Create jest.config.ts, jest.setup.ts. Install Playwright and create playwright.config.ts.
Add test scripts to package.json.
```

---

### Phase 2: Dashboard & Accounts

#### 2.1 Dashboard Data Fetching

**Agent:** Main conversation or direct implementation

```
Create src/actions/dashboard.ts with all server actions: getNetWorth(),
getMonthlyIncomeExpense(months), getSpendingByCategory(month),
getCreditUtilization(), getUpcomingBills(count), getRecentTransactions(count),
getMonthOverMonthChange(). Follow the transaction type rules strictly.
```

**Then chain → `test-agent`**:

```
Write unit tests for all dashboard server actions. Mock the Prisma Client.
Verify getMonthlyIncomeExpense only includes income/interest_earned for income
and expense/loan_interest/interest_charged for spending. Verify transfers are
NEVER included in any totals.
```

**Then chain → `test-transactions`** (read-only audit):

```
Audit the dashboard.ts server actions. Verify every WHERE clause correctly
filters by the right transaction types. Check that transfers are excluded everywhere.
```

> **Between tasks:** Dashboard data layer tested and audited. Move to 2.2.

---

#### 2.2 Dashboard Components

**Agent:** `component-builder`

```
Create all dashboard widget components: net-worth-card.tsx (total with trend arrow),
income-expense-chart.tsx (Recharts BarChart, 6/12 month toggle),
spending-breakdown.tsx (PieChart by category), credit-utilization.tsx
(progress bars color-coded green/orange/red with owner names),
upcoming-bills.tsx (next 5-10 bills with days-until-due),
recent-transactions.tsx (last 10, color-coded by type).
```

**Then chain → `test-agent`**:

```
Write component tests for each dashboard widget. Mock the server action data.
Verify correct rendering in both light and dark themes.
```

> **Between tasks:** Widgets built and tested. Move to 2.3.

---

#### 2.3 Dashboard Page

**Agent:** `component-builder`

```
Assemble src/app/page.tsx with all dashboard components in a responsive grid layout.
All data from server actions (no client-side fetching for initial load).
Add loading skeletons for each card.
```

> **Between tasks:** Dashboard page assembled. Move to 2.4.

---

#### 2.4 Accounts Pages

**Agent:** Main conversation for server actions:

```
Create src/actions/accounts.ts with: getAccounts(), getAccount(id), createAccount(data),
updateAccount(id, data), deleteAccount(id), recalculateBalance(id), recalculateAllBalances().
```

**Then chain → `test-agent`**:

```
Write unit tests for all account server actions. Test recalculateBalance detects
and corrects drift. Test createAccount creates credit_card_details for CC type
and loan record for loan/mortgage type.
```

**Then chain → `component-builder`**:

```
Build account-card.tsx (name, type icon, balance, owner, utilization bar for CCs),
account-form.tsx (conditional fields by type), balance-chart.tsx (Recharts line chart).
Build src/app/accounts/page.tsx (grid grouped by type with totals).
Build src/app/accounts/[id]/page.tsx (header, recalculate button, balance chart,
transaction list, CC-specific APR/grace period info, loan details, interest history).
```

**Then chain → `test-agent`**:

```
Write component tests for the account form: verify conditional fields appear
for credit cards (limit, statement close day, grace period) and loans (apr, term, lender).
```

> **Between tasks:** Move to 2.5.

---

#### 2.5 Recalculate API

**Agent:** Main conversation:

```
Create src/app/api/recalculate/route.ts: POST with { accountId } for single account,
POST with { all: true } for all accounts. Returns drift report.
```

**Then chain → `test-agent`**:

```
Write unit tests for the recalculate API route. Test single account and all-accounts modes.
Test that drift is correctly calculated as stored minus calculated balance.
```

> **Between tasks:** Phase 2 complete. Run `test-transactions` for a full audit:

```
Audit all Phase 2 code. Verify dashboard totals, account balances, and
recalculate logic are all consistent. Check no transfers leak into income/expense.
```

---

### Phase 3: Transactions & Intelligence

#### 3.1 Transaction CRUD

**Agent:** Main conversation:

```
Create src/actions/transactions.ts with: getTransactions(filters) with pagination,
createTransaction(data) + balance update, updateTransaction(id, data) with balance
reversal and reapply, deleteTransaction(id) with balance reversal and unlink,
bulkCategorize(ids, category).
```

**Then chain → `test-agent`**:

```
Write unit tests for all transaction CRUD operations. Test that createTransaction
updates the account balance. Test that deleteTransaction reverses the balance
and unlinks paired transfers. Test that updateTransaction reverses old impact
and applies new.
```

> **Between tasks:** Move to 3.2.

---

#### 3.2 Transfer Wizard

**Agent:** Main conversation for the action:

```
Create src/actions/transfers.ts with createTransfer() that atomically creates
both sides with linked_transaction_id, updates both balances, all in a DB transaction.
Handle all scenarios: checking↔savings, checking→CC payment, loan→checking.
```

**Then chain → `test-agent`**:

```
Write unit tests for createTransfer. Verify both transactions are type 'transfer',
linked_transaction_id is set on both sides, both account balances updated,
and the whole operation is atomic (rolls back on failure).
```

**Then chain → `component-builder`**:

```
Create src/components/transactions/transfer-wizard.tsx with source/destination
account dropdowns (showing owner names), amount input, date picker, and
auto-generated description.
```

**Then chain → `test-transactions`**:

```
Verify the transfer wizard creates correct pairs. Check that transfers
are excluded from all income/expense calculations in dashboard actions.
```

> **Between tasks:** Move to 3.3.

---

#### 3.3 Loan Payment Recording

**Agent:** Main conversation:

```
Create src/actions/loan-payments.ts with recordLoanPayment() that calculates
principal/interest split, creates the transfer transaction on checking,
creates loan_principal and loan_interest on the loan account, links them,
updates loan balance and remaining months, logs interest. All atomic.
```

**Then chain → `test-agent`**:

```
Write unit tests for recordLoanPayment. Verify principal + interest = total payment.
Verify loan balance decreases by principal amount. Verify interest logged.
Test against a known amortization schedule for accuracy.
```

**Then chain → `component-builder`**:

```
Create src/components/transactions/loan-payment-form.tsx with loan selector,
pre-filled payment amount, from-account dropdown, date picker, and
calculated principal/interest split preview.
```

> **Between tasks:** Move to 3.4.

---

#### 3.4 Per-Transaction APR Management

**Agent:** Main conversation:

```
Create src/actions/apr-rates.ts with getAprRates(accountId), createAprRate(data),
updateAprRate(id, data), deleteAprRate(id).
```

**Then chain → `test-agent`**:

```
Write unit tests for APR rate CRUD. Test that deleteAprRate soft-deletes
(sets is_active = false). Test rate type validation.
```

**Then chain → `component-builder`**:

```
Add APR rate selector to the transaction form when account type is credit card.
Create APR rates management section on the account detail page: list all rates,
add/edit/deactivate, show which transactions use each rate.
```

> **Between tasks:** Move to 3.5.

---

#### 3.5 Transaction List Page

**Agent:** `component-builder`

```
Build transaction-filters.tsx (account multi-select with owner names, category multi-select,
type filter, date range picker, search, owner filter, clear button).
Build transaction-table.tsx (sortable columns, color coding by type, linked transaction
indicator, APR rate badge, inline category editing, checkbox selection for bulk).
Build transaction-form.tsx (tabs: Expense | Income | Transfer | Loan Payment,
conditional fields, APR selector for CC accounts).
Assemble src/app/transactions/page.tsx with filters, table, pagination, add button, bulk categorize.
```

**Then chain → `test-agent`**:

```
Write component tests for the transaction table: verify filter application,
type color coding, linked transaction icon display, and bulk categorize flow.
```

> **Between tasks:** Move to 3.6.

---

#### 3.6 Verification

**Agent:** `test-agent`

```
Write E2E Playwright tests for all Phase 3 scenarios:
- Create expense on CC → appears in expense totals, balance updated
- Create CC payment from checking → shows as transfer, excluded from totals, both balances updated
- Create checking→savings transfer → both sides excluded from income/expense
- Create loan payment → principal excluded, interest shows as expense, loan balance updated
- Delete a linked transfer → both sides deleted, both balances reversed
- Edit transaction amount → old balance reversed, new balance applied
- Dashboard totals match expected values after all scenarios
- Per-transaction APR rates display correctly
```

**Then chain → `test-transactions`** for a final read-only audit:

```
Run a full audit of all transaction-related code. Check every server action,
every component, every query. Report any place where transaction type filtering
is incorrect or transfers could leak into income/expense totals.
```

> **Between tasks:** Phase 3 complete and verified. Move to Phase 4.

---

### Phase 4: Loans & Interest

#### 4.1 Loan CRUD

**Agent:** Main conversation:

```
Create src/actions/loans.ts with getLoans(), getLoan(id), createLoan(data),
updateLoan(id, data), deleteLoan(id). createLoan creates both the account
(type: loan/mortgage) and the loan record.
```

**Then chain → `test-agent`**:

```
Write unit tests for loan CRUD. Test that createLoan creates both account
and loan record. Test soft delete sets is_active = false.
```

> **Between tasks:** Move to 4.2.

---

#### 4.2 Amortization Engine

**Agent:** Main conversation:

```
Create all amortization functions in src/lib/calculations.ts:
calculatePaymentSplit(), generateAmortizationSchedule(),
calculateExtraPaymentImpact(), calculateTotalInterestPaid(),
calculateTotalInterestRemaining().
```

**Then chain → `test-agent`** (highest priority — pure functions):

```
Write exhaustive unit tests for all amortization functions. Test against
known amortization tables. Test edge cases: zero balance, zero APR,
final payment rounding, extra payment that exceeds remaining balance.
Verify APR-to-daily-rate conversion precision.
```

> **Between tasks:** Calculations tested. Move to 4.3.

---

#### 4.3 Loan Pages

**Agent:** `component-builder`

```
Build loan-card.tsx (name, type, balance/principal progress bar, APR, payment, payoff date),
loan-form.tsx (add/edit dialog), src/app/loans/page.tsx (grid + summary bar),
amortization-table.tsx (full schedule with current month highlight),
extra-payment-calc.tsx (input extra amount, shows months/interest saved, comparison chart),
src/app/loans/[id]/page.tsx (header, payment history, amortization, calculator, interest chart).
```

**Then chain → `test-agent`**:

```
Write component tests for the extra payment calculator: verify it shows correct
months saved and interest saved. Test amortization table highlights current month.
```

> **Between tasks:** Move to 4.4.

---

#### 4.4 Interest Tracking — Cron Jobs

**Agent:** `cron-builder`

```
Implement cron/src/jobs/interest-cc.ts: daily CC interest accrual with
per-transaction APR lookup, grace period respect, daily rate calculation.
```

**Then chain → `test-agent`**:

```
Write unit tests for interest-cc.ts. Test that grace period is respected
(no interest when prior statement paid in full). Test that expired APR
falls back to standard rate. Test daily rate calculation precision.
```

**Then chain → `cron-builder`**:

```
Implement cron/src/jobs/interest-savings.ts: monthly savings interest
from APY, creates interest_earned transaction, updates balance.
```

**Then chain → `test-agent`**:

```
Write unit tests for interest-savings.ts. Verify monthly interest = balance * (apy / 100 / 12).
```

**Then chain → `cron-builder`**:

```
Implement cron/src/jobs/statement-close.ts: daily check for CC statement close day,
snapshot balance, check if prior statement paid in full.
```

**Then chain → `test-agent`**:

```
Write unit tests for statement-close.ts. Verify balance snapshot and paid-in-full flag.
```

**Then chain → `cron-builder`**:

```
Implement cron/src/jobs/apr-expiration.ts: daily expired APR cleanup,
deactivate rates, reassign transactions to standard rate.
```

**Then chain → `test-agent`**:

```
Write unit tests for apr-expiration.ts. Verify expired rates deactivated
and transactions reassigned.
```

**Then chain → `component-builder`**:

```
Create an interest summary component for the dashboard: total interest paid
this month/year, total interest earned, net interest.
```

> **Between tasks:** Phase 4 complete. Run `test-transactions` for audit:

```
Audit all interest calculation and cron job code. Verify grace period logic
is correct. Check that interest_charged counts as spending and interest_earned
counts as income in all dashboard queries.
```

---

### Phase 5: Recurring Bills, Budgets & Import

#### 5.1 Recurring Bills

**Agent:** Main conversation for actions:

```
Create src/actions/recurring.ts with getRecurringBills(), createRecurringBill(data),
updateRecurringBill(id, data), deleteRecurringBill(id), getUpcomingBills(days),
confirmVariableBill(transactionId, actualAmount).
```

**Then chain → `test-agent`**:

```
Write unit tests for recurring bill actions. Test confirmVariableBill updates
pending transaction with actual amount. Test getUpcomingBills returns correct
bills within date range.
```

**Then chain → `component-builder`**:

```
Build bill-card.tsx (name, amount, due day, account, frequency, Fixed/Variable badge),
bill-form.tsx (add/edit with is_variable_amount toggle),
bills-calendar.tsx (month view showing due dates).
Build src/app/recurring/page.tsx (list/grid, calendar toggle, group by account,
total monthly cost, pending variable bills section).
```

**Then chain → `cron-builder`**:

```
Implement cron/src/jobs/recurring-bills.ts: daily 6AM check, auto-generate
fixed-amount transactions with source='recurring', create pending transactions
for variable-amount bills needing confirmation.
```

**Then chain → `test-agent`**:

```
Write unit tests for recurring-bills.ts cron job. Test fixed bills create
exact-amount transactions. Test variable bills create pending transactions.
Test it handles "already generated for this period" correctly.
```

> **Between tasks:** Move to 5.2.

---

#### 5.2 Budgets

**Agent:** Main conversation for actions:

```
Create src/actions/budgets.ts with getBudgets(period), createBudget(data),
updateBudget(id, data), deleteBudget(id), getBudgetVsActual(period),
copyBudgets(fromPeriod, toPeriod).
```

**Then chain → `test-agent`**:

```
Write unit tests for budget actions. Verify getBudgetVsActual only sums
spending types (expense, loan_interest, interest_charged) per category.
Test copyBudgets duplicates entries correctly.
```

**Then chain → `component-builder`**:

```
Build budget-bar.tsx (progress bar, color-coded green/orange/red at 80%/100% thresholds),
budget-form.tsx (add/edit dialog).
Build src/app/budgets/page.tsx (month selector, budget bars grid, total budgeted vs spent,
add button, copy from previous month).
```

**Then chain → `test-agent`**:

```
Write component tests for budget bars. Verify correct color thresholds:
green (<80%), orange (80-100%), red (>100%). Verify remaining/overage display.
```

> **Between tasks:** Move to 5.3.

---

#### 5.3 CSV Import

**Agent:** Main conversation for the import action:

```
Create src/actions/import.ts with parseCSV(), detectAmountPattern(),
detectColumns(), normalizeAmounts(), detectDuplicates() (exact + fuzzy Levenshtein < 3),
importTransactions().
```

**Then chain → `test-agent`**:

```
Write unit tests for all import functions. Test detectAmountPattern correctly
identifies all 3 patterns. Test normalizeAmounts for each pattern.
Test detectDuplicates with exact match, fuzzy match, and no-match cases.
Test Levenshtein distance calculation edge cases.
```

**Then chain → `csv-import-tester`** (read-only audit):

```
Audit the import action code. Check edge case handling: empty rows, extra whitespace,
quoted fields, different date formats, currency symbols in amounts, UTF-8 encoding.
Verify the Levenshtein implementation is correct.
```

**Then chain → `component-builder`**:

```
Build csv-uploader.tsx (drag & drop, preview first 5 rows, target account dropdown),
column-mapper.tsx (auto-detected pattern with override, pattern-specific UI for all 3 types,
live preview of 5 mapped rows),
import-preview.tsx (full list with duplicate flags red/yellow/green, checkboxes,
auto-categorization suggestions, summary counts, confirm button).
Build src/app/import/page.tsx as step wizard: Upload → Map → Preview → Confirm.
```

**Then chain → `test-agent`**:

```
Write component tests for the column mapper: verify correct UI renders for each
of the 3 detected patterns. Test import preview shows correct duplicate badges.
```

> **Between tasks:** Phase 5 complete. Run full verification:

**`test-agent`:**
```
Run the full Jest test suite. Report any failures.
```

**`test-transactions`:**
```
Full audit of all server actions created in Phases 2-5. Verify every query
uses correct transaction type filters. Report any inconsistencies.
```

---

### Phase 6: Bank Connectivity (Plaid)

#### 6.1-6.2 Plaid Setup & Schema

**Agent:** Main conversation for setup, then `db-migrate`:

```
Install the Plaid SDK (pnpm add plaid). Create src/lib/plaid.ts with
Plaid client configuration. Add PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV to .env.
```

**Then chain → `db-migrate`**:

```
Add the plaid_connections table to schema.ts: id, access_token (encrypted),
item_id, institution_name, last_synced, cursor, status, created_at.
Generate and apply the migration.
```

> **Between tasks:** Move to 6.3.

---

#### 6.3 Plaid API Routes

**Agent:** Main conversation:

```
Create src/app/api/plaid/create-link-token/route.ts,
src/app/api/plaid/exchange-token/route.ts (store encrypted access token,
fetch account info, create/link accounts),
src/app/api/plaid/sync/route.ts (transactionsSync with cursor, auto-categorize,
duplicate detection, insert new, flag duplicates).
```

**Then chain → `test-agent`**:

```
Write unit tests for the Plaid API routes with mocked Plaid SDK responses.
Test token exchange stores encrypted access token. Test sync correctly
maps Plaid transactions and runs duplicate detection.
```

> **Between tasks:** Move to 6.4.

---

#### 6.4 Plaid Connection UI

**Agent:** `component-builder`

```
Build the Plaid connection section in src/app/settings/page.tsx: "Connect Bank"
button that opens Plaid Link, list of connected institutions with last sync time,
manual sync trigger, disconnect with confirmation.
```

> **Between tasks:** Move to 6.5.

---

#### 6.5 Plaid Sync Cron Job

**Agent:** `cron-builder`

```
Implement cron/src/jobs/plaid-sync.ts: runs every 6 hours, syncs each active
plaid_connection, handles expired tokens and rate limits gracefully.
```

**Then chain → `test-agent`**:

```
Write unit tests for plaid-sync.ts. Test it handles expired token errors
and rate limit responses gracefully without crashing.
```

> **Between tasks:** Move to 6.6.

---

#### 6.6 Sync Duplicate Handling

**Agent:** `component-builder`

```
Create a review queue UI (section on transactions page or separate view):
list flagged potential duplicates from Plaid sync, show Plaid transaction
alongside potential match. Actions: "It's a match" (skip), "It's new" (import), "Ignore".
```

**Then chain → `test-agent`**:

```
Write component tests for the duplicate review queue. Test all three actions
(match/new/ignore) update state correctly.
```

> **Between tasks:** Phase 6 complete. Run `test-transactions` audit:

```
Audit all Plaid-related code. Verify imported transactions tagged with source='plaid'.
Check that Plaid sync doesn't create orphaned or unlinked transfers.
```

---

### Phase 7: Settings & Polish

#### 7.1 Settings Page

**Agent:** `component-builder`

```
Build src/app/settings/page.tsx with all sections: theme toggle, custom categories
management, full disclaimer text, recalculate all balances button with drift report,
seed data (wipe with "type DELETE" confirmation + load demo data),
database backup trigger + download links, data export as JSON/CSV,
Plaid connections section.
```

**Then chain → `test-agent`**:

```
Write component tests for the settings page. Test the wipe confirmation requires
typing "DELETE". Test recalculate shows drift report before confirming.
```

> **Between tasks:** Move to 7.2.

---

#### 7.2 Polish & UX

**Agent:** `component-builder`

```
Add toast notifications for all CRUD operations using shadcn toast.
Add confirmation dialogs for all destructive actions.
Add loading skeletons for all data-fetching components.
Fix responsive design at mobile/tablet/desktop widths.
Add keyboard shortcuts (Ctrl+N for new transaction, Ctrl+K for search).
Add error boundaries. Add empty states for all list pages.
Ensure all charts render correctly in both themes.
```

> **Between tasks:** Move to 7.3.

---

#### 7.3 Performance

**Agent:** Main conversation:

```
Review and add database indexes for slow queries. Implement server-side
pagination for the transaction list. Add React Suspense boundaries for
streaming dashboard data. Optimize Recharts renders with React.memo.
```

**Then chain → `docker-dev`**:

```
Run docker compose up --build from a clean state. Verify all three containers
start correctly. Check logs for errors or performance issues.
```

> **Between tasks:** Phase 7 complete. Final verification below.

---

### Final Verification (All Phases Complete)

Run these agents in sequence for a comprehensive final check:

**1. `test-agent`** — Run the full test suite:

```
Run pnpm exec jest --coverage to execute all unit and component tests.
Report coverage percentages and any failures.
```

**2. `test-agent`** — Run E2E tests:

```
Run pnpm exec playwright test to execute all E2E specs.
Report any failures with screenshots.
```

**3. `test-transactions`** — Full transaction integrity audit:

```
Final audit of the entire codebase. Check every server action, every dashboard query,
every component that displays financial data. Verify the core principle is never violated:
money moving between your own accounts is never income or expense.
```

**4. `csv-import-tester`** — Import system audit:

```
Final audit of the CSV import system. Verify all 3 amount patterns,
duplicate detection, and edge case handling.
```

**5. `docker-dev`** — Clean deployment test:

```
Tear down all containers, rebuild from scratch with docker compose up --build.
Verify all three containers start, app serves on port 3000, cron logs job registration.
Run db:seed and verify the app displays seed data correctly.
```

---

## Agent Details

### db-migrate

**When to use:** Any time you need to change the database schema.

**Common tasks:**
- Add new columns or tables to `src/db/schema.ts`
- Generate and apply migrations with `pnpm exec prisma migrate dev`
- Deploy migrations in production with `pnpm exec prisma migrate deploy`
- Add indexes for performance
- Modify enums or constraints

**Example prompts:**
```
Add a "tags" array column to the transactions table
Create a new "plaid_connections" table for Phase 6
Add an index on transactions.date for faster queries
```

---

### seed-manager

**When to use:** When you need demo data changes or a fresh database.

**Common tasks:**
- Add new seed data for newly created tables
- Update seed data to match schema changes
- Fix seed data that violates new constraints
- Run the full wipe-and-seed cycle

**Example prompts:**
```
Add seed data for the new tags feature
Update the seed to include 12 months of transactions instead of 6
Reset the database with fresh seed data
```

---

### docker-dev

**When to use:** For any Docker or infrastructure work.

**Common tasks:**
- Troubleshoot container startup failures
- Modify Docker Compose configuration
- Add environment variables
- Debug container networking
- Optimize Dockerfiles

**Example prompts:**
```
Why is the cron container failing to start?
Add a Redis container for caching
Check the app container logs for errors
```

---

### test-transactions

**When to use:** After any changes to transaction logic, server actions, or dashboard queries. This is a **read-only** agent — it identifies problems but does not fix them.

**Common tasks:**
- Verify transfer pairs have matching `linked_transaction_id`
- Check that dashboard income/expense totals exclude transfers
- Validate loan payment principal/interest splits
- Confirm balance calculations match transaction sums

**Example prompts:**
```
Verify all transfer pairs in the codebase are correctly linked
Check that the dashboard queries properly exclude transfers from income/expense
Audit the loan payment split logic for correctness
```

---

### test-agent

**When to use:** After writing or modifying code to create tests, or when fixing failing tests. Has **persistent memory** — it learns test patterns and recurring issues across sessions.

**Test stack:** Jest (unit/integration) + Playwright (E2E)

**Common tasks:**
- Write unit tests for financial calculations in `src/lib/`
- Write integration tests for server actions in `src/actions/`
- Write component tests for React components
- Write Playwright E2E tests for critical user flows
- Fix failing tests and diagnose test issues
- Check and improve test coverage

**Test priority order:**
1. Financial calculations (pure functions, most critical)
2. Server actions (mock DB layer)
3. Cron jobs (mock DB connection)
4. Components (React Testing Library)
5. E2E flows (Playwright, requires Docker stack running)

**Example prompts:**
```
Write tests for the amortization calculation functions
Add unit tests for the transfer creation server action
Fix the failing dashboard component tests
Run the full test suite and report failures
Write a Playwright E2E test for the CSV import flow
```

---

### component-builder

**When to use:** When building or modifying any frontend UI.

**Common tasks:**
- Create new page components
- Build dashboard widgets with Recharts
- Add shadcn/ui components
- Implement forms with proper validation
- Ensure dark mode support

**Example prompts:**
```
Build the account detail page with a balance history chart
Create the transaction filter sidebar with date range and category selectors
Add a transfer wizard dialog using shadcn/ui
```

---

### cron-builder

**When to use:** When creating or modifying scheduled background jobs.

**Common tasks:**
- Create new cron jobs in `cron/src/jobs/`
- Register jobs in `cron/src/index.ts`
- Debug failing scheduled tasks
- Modify job schedules or logic

**Example prompts:**
```
Create the daily credit card interest accrual job
Fix the recurring bills job to handle variable amounts correctly
Add a monthly account balance snapshot job
```

---

### csv-import-tester

**When to use:** When testing the CSV import system. This is a **read-only** agent.

**Common tasks:**
- Verify the three amount column patterns are detected correctly
- Test duplicate detection (exact and fuzzy match)
- Check edge case handling in CSV parsing
- Validate column mapping logic

**Example prompts:**
```
Check if the CSV parser handles all three amount patterns correctly
Verify the Levenshtein duplicate detection logic
Test how the importer handles malformed CSV files
```

---

## Managing Sub-Agents

### View All Agents

Run `/agents` in Claude Code to see all available sub-agents, including built-in ones and these custom ones.

### Edit an Agent

Either edit the markdown file directly in `.claude/agents/` or use `/agents` to modify through the interactive UI.

### Create New Agents

1. Create a new `.md` file in `.claude/agents/`
2. Add YAML frontmatter with `name`, `description`, and optional `tools`, `model`, etc.
3. Write the system prompt in the markdown body
4. Restart Claude Code or use `/agents` to load immediately

### Agent File Format

```markdown
---
name: my-agent
description: When Claude should use this agent
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet  # or haiku, opus, inherit
---

System prompt content goes here. This tells the agent
what it does and how to approach tasks.
```

### Available Fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Unique ID (lowercase + hyphens) |
| `description` | Yes | When to delegate to this agent |
| `tools` | No | Tool allowlist (inherits all if omitted) |
| `disallowedTools` | No | Tools to deny |
| `model` | No | `sonnet`, `opus`, `haiku`, or `inherit` |
| `permissionMode` | No | `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan` |
| `maxTurns` | No | Max agentic turns before stopping |
| `memory` | No | Persistent memory: `user`, `project`, or `local` |
| `hooks` | No | Lifecycle hooks scoped to this agent |
| `skills` | No | Skills to preload into the agent's context |

## Tips

- **Read-only agents** (`test-transactions`, `csv-import-tester`) are safe to run anytime — they can't modify your code
- **Use Haiku agents** (`docker-dev`, `csv-import-tester`) for fast, routine tasks to save cost and latency
- **Chain agents** for multi-step workflows: schema change → seed update → integrity test
- **Run in background** for long operations so you can keep working
- Sub-agents **cannot spawn other sub-agents** — if you need nested delegation, chain them from the main conversation
- **Always test after implementing** — the pattern is: build → `test-agent` (write tests) → `test-transactions` (audit)
- **Between phases**, run `test-transactions` for a full audit to catch issues before they compound
