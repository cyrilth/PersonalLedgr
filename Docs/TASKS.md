# PersonalLedgr — Tasks

> A self-hosted finance app that actually knows the difference between spending money and moving it around.

## Phase 1: Foundation

### 1.1 Project Scaffolding
- [x] Initialize Next.js 15 project with TypeScript and App Router
  ```bash
  pnpm dlx create-next-app@latest personalledgr --typescript --tailwind --eslint --app --src-dir
  ```
- [x] Install core dependencies
  ```bash
  pnpm add @prisma/client recharts lucide-react next-themes better-auth
  pnpm add -D prisma
  ```
- [x] Install and configure shadcn/ui
  ```bash
  pnpm dlx shadcn@latest init
  pnpm dlx shadcn@latest add button card input label select table dialog sheet tabs badge separator dropdown-menu popover calendar command sonner progress switch
  ```
- [x] Create `src/lib/constants.ts` with category list, transaction type enum values, and format helpers
- [x] Create `src/lib/utils.ts` with currency formatting, date helpers, uid generator
- [x] Set `output: 'standalone'` in `next.config.ts` (required for Docker)

### 1.2 Theme Setup
- [x] Install `next-themes`: `pnpm add next-themes`
- [x] Create `src/components/theme-provider.tsx` wrapping `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `storageKey="personalledgr-theme"`
- [x] Create `src/components/layout/theme-toggle.tsx` — toggle button with sun/moon icons
- [x] Configure Tailwind for dark mode: `darkMode: "class"` via `@custom-variant dark` in globals.css (Tailwind CSS 4 approach)
- [x] Update `globals.css` with emerald green color scheme:
  - **Primary:** emerald-600 (light) / emerald-500 (dark) — buttons, active sidebar items, links, focus rings
  - **Semantic finance colors** (custom CSS variables):
    - `--color-positive` — green-500 for income, gains, under-budget
    - `--color-negative` — red-500 for expenses, losses, over-budget
    - `--color-transfer` — blue-500 for neutral money movement
  - **Chart palette:** 5 distinguishable colors tuned per light/dark mode
  - **Neutral gray** base for backgrounds, cards, borders, muted text
- [x] Ensure shadcn/ui CSS variables include both light and dark palettes in `globals.css`

### 1.3 Authentication (Better Auth)
- [x] Add `BETTER_AUTH_SECRET` to `.env` (generate via `openssl rand -base64 32`)
- [x] Add `BETTER_AUTH_URL=http://localhost:3000` to `.env`
- [x] Define Better Auth schema in `prisma/schema.prisma`:
  - `user`, `session`, `authAccount` (renamed from `account`), and `verification` models
  - `authAccount` renamed to avoid conflict with the finance `Account` model
  - Configured `account.modelName: "authAccount"` in Better Auth server config
- [x] Add `userId` foreign key to all user-owned finance models *(done in Task 1.5)*:
  - `Account.userId`, `Transaction.userId`, `Budget.userId`, `RecurringBill.userId`, `InterestLog.userId`
  - All queries must filter by `userId` from session
- [x] Create `src/db/index.ts` — PrismaClient singleton with global caching for dev hot-reload
- [x] Create `src/lib/auth.ts` — Better Auth server config with `prismaAdapter`, `emailAndPassword`, `nextCookies` plugin
- [x] Create `src/lib/auth-client.ts` — Better Auth client (`signIn`, `signUp`, `signOut`, `useSession`)
- [x] Create `src/app/api/auth/[...all]/route.ts` — Better Auth API route handler
- [x] Create `src/app/(auth)/login/page.tsx` — login form with error display, link to register
- [x] Create `src/app/(auth)/register/page.tsx` — registration form with validation (password match, min 8 chars), link to login
- [x] Create `src/proxy.ts` — Next.js 16 proxy (replaces deprecated `middleware.ts`):
  - Uses `getSessionCookie()` from `better-auth/cookies` for fast cookie-only check
  - Protects all routes except `/login`, `/register`, and `/api/auth`
  - Redirects unauthenticated users to `/login`
  - Redirects authenticated users away from `/login` and `/register` to `/`
- [x] Test: unauthenticated user redirected to login
- [x] Test: registration creates user and establishes session
- [x] Test: login with valid credentials grants access
- [x] Test: login with invalid credentials shows error
- [ ] Test: each user sees only their own data *(deferred — no data-displaying pages yet)*

### 1.4 Docker Setup (3 Containers)
- [x] Create root `Dockerfile` for Next.js with multi-stage build (deps → builder → runner)
- [x] Create `cron/` directory for the cron container:
  - [x] `cron/Dockerfile` — Node.js Alpine, builds from root context with Prisma
  - [x] `cron/package.json` — minimal config (deps in root package.json: `@prisma/client`, `node-cron`, `tsx`)
  - [x] `cron/tsconfig.json`
  - [x] `cron/src/index.ts` — entry point that registers all cron jobs
  - [x] `cron/src/db.ts` — database connection (reuses generated Prisma client)
- [x] Create `docker-compose.yml` with three services:
  - `app` — Next.js on port 3000, depends on db
  - `db` — PostgreSQL 16 Alpine, internal port 5432, healthcheck, persistent volume
  - `cron` — scheduled jobs container, depends on db, shares DATABASE_URL
- [x] Create `.env.example` with all environment variables (DATABASE_URL, POSTGRES_PASSWORD, BETTER_AUTH_SECRET, BETTER_AUTH_URL, APP_PORT)
- [x] Create `.dockerignore` (node_modules, .next, .git, cron/node_modules, Docs)
- [x] Test `docker compose up --build` starts all three containers
- [x] Verify app connects to PostgreSQL
- [x] Verify cron container connects to PostgreSQL and logs startup

### 1.5 Database Schema
- [x] Create `src/db/index.ts` — PrismaClient singleton (with global caching for dev hot-reload) *(done in Task 1.3)*
- [x] Initialize Prisma: `pnpm exec prisma init` (creates `prisma/schema.prisma`) *(done in Task 1.3)*
- [x] Define `prisma/schema.prisma` with all models and enums:
  - [x] **Enums:**
    - [x] `AccountType` — CHECKING, SAVINGS, CREDIT_CARD, LOAN, MORTGAGE
    - [x] `TransactionType` — INCOME, EXPENSE, TRANSFER, LOAN_PRINCIPAL, LOAN_INTEREST, INTEREST_EARNED, INTEREST_CHARGED
    - [x] `TransactionSource` — MANUAL, IMPORT, PLAID, RECURRING, SYSTEM
    - [x] `LoanType` — MORTGAGE, AUTO, STUDENT, PERSONAL
    - [x] `RecurringFrequency` — MONTHLY, QUARTERLY, ANNUAL
    - [x] `InterestLogType` — CHARGED, EARNED
    - [x] `AprRateType` — STANDARD, INTRO, BALANCE_TRANSFER, CASH_ADVANCE, PENALTY, PROMOTIONAL
  - [x] **Models:**
    - [x] `Account` — with `owner` String?, `userId` FK, balance Decimal(12,2), creditLimit, isActive
    - [x] `CreditCardDetails` — 1:1 with Account (statementCloseDay, paymentDueDay, gracePeriodDays @default(25), lastStatementBalance, lastStatementPaidInFull, minimumPaymentPct, minimumPaymentFloor)
    - [x] `AprRate` — per-account APR rate definitions (rateType, apr, effectiveDate, expirationDate, description, isActive). @@index([accountId, isActive])
    - [x] `Loan` — 1:1 with Account via accountId @unique
    - [x] `Transaction` — with `aprRateId` String? relation to AprRate, `linkedTransactionId` self-referential @unique FK, indexes on [userId,date], [accountId,date], [userId,type], [userId,category], [date,amount,description]
    - [x] `RecurringBill` — with `isVariableAmount` Boolean @default(false), `userId` and `accountId` FKs
    - [x] `Budget` — with @@unique([userId, category, period])
    - [x] `InterestLog` — with @@index([accountId, date]), @@index([userId, date])
  - [x] All finance models include `userId` FK to `user` for multi-user data scoping
- [x] Run `pnpm exec prisma generate` to generate Prisma Client (validated schema)
- [x] Run `pnpm exec prisma migrate dev --name init` to create and apply initial migration *(requires running PostgreSQL)*
- [x] Verify all tables and indexes created in PostgreSQL *(requires running PostgreSQL)*

### 1.6 Seed Data
- [x] Create `src/db/seed.ts` with realistic demo data:
  - [x] 7 accounts (4 banking + 3 loan accounts) with owner field
  - [x] Credit card details for both CCs (Chase Sapphire + Discover It)
  - [x] APR rates: Chase standard 24.99%, intro 0% (Best Buy), Discover standard 22.49%
  - [x] 3 loans: Mortgage ($285k, 6.75%), Car ($18.5k, 5.49%), Student ($32k, 4.99%)
  - [x] 6 months of transactions: paychecks, recurring bills, variable expenses, CC payments (linked transfer pairs), mortgage/loan splits (principal + interest), savings transfers (linked), interest earned/charged, Best Buy 0% intro purchase
  - [x] 5 recurring bills (3 fixed, 2 variable)
  - [x] 3 budget entries (Groceries $600, Dining $300, Entertainment $200)
  - [x] 12 interest log entries (6 months x savings earned + Discover charged)
- [x] Add seed script to package.json: `"db:seed": "tsx src/db/seed.ts"` *(done in Task 1.4)*
- [x] Create `src/db/wipe-seed.ts` — deletes all finance data in dependency order
- [x] Add wipe script to package.json: `"db:wipe": "tsx src/db/wipe-seed.ts"` *(done in Task 1.4)*
- [x] Create API route `src/app/api/seed/route.ts`:
  - POST `/api/seed?action=wipe` — calls wipe logic
  - POST `/api/seed?action=generate` — calls seed logic
- [x] Test seed populates all tables correctly *(requires running PostgreSQL)*
- [x] Test wipe clears all data *(requires running PostgreSQL)*

### 1.7 Base Layout
- [x] Create `src/components/layout/sidebar.tsx`
  - Sidebar with nav links: Dashboard, Transactions, Accounts, Loans, Recurring Bills, Budgets, Import, Settings
  - Icons from lucide-react for each link
  - Active link highlighting based on current route
  - Theme toggle in sidebar footer
  - Collapsible on mobile (hamburger menu with overlay)
- [x] Create `src/components/layout/header.tsx` — page title derived from current route
- [x] Create `src/components/layout/footer.tsx` — app footer with short disclaimer text linking to settings
- [x] Create `src/app/(app)/layout.tsx` — app layout wrapping children with sidebar + header + footer
  - Root layout (`src/app/layout.tsx`) provides ThemeProvider only
  - `(app)` route group provides sidebar/header/footer for authenticated pages
  - `(auth)` route group provides clean layout for login/register
- [x] Create placeholder pages for all routes inside `(app)/`:
  - Dashboard (`/`), Transactions, Accounts, Loans, Recurring Bills, Budgets, Import, Settings
- [x] Verify navigation redirects work (all protected routes → `/login` when unauthenticated)
- [x] Verify dark/light mode toggle works and persists

### 1.8 First-Launch Disclaimer Screen
- [x] Create `src/components/disclaimer-modal.tsx`:
  - Full-screen modal/overlay with semi-transparent backdrop (z-100)
  - Displays the complete disclaimer text in a scrollable area
  - "I understand and accept" button to dismiss
  - Stores acknowledgment in localStorage (`personalledgr-disclaimer-accepted: true`)
  - Cannot be dismissed without clicking accept (no close button, no backdrop click)
  - Shown again if localStorage is cleared
- [x] Integrate into root layout: DisclaimerModal rendered inside ThemeProvider, checks localStorage on mount
- [x] Test: fresh browser shows disclaimer, accepting persists, clearing storage re-shows it

### 1.8b Global Year Picker
- [x] Create `src/contexts/year-context.tsx` — `YearProvider` with `useState`, localStorage persistence (`personalledgr-selected-year`), validation (2000–currentYear+1), hydration guard
- [x] Export `useYear()` hook returning `{ year, setYear }`
- [x] Wrap `src/app/(app)/layout.tsx` with `<YearProvider>` so all app pages have access
- [x] Add year picker dropdown to `src/components/layout/header.tsx` — shadcn `Select` with `CalendarDays` icon, 7 year options (currentYear+1 down to currentYear-5), right-aligned via `ml-auto`
- [x] Test: header shows year dropdown defaulting to current year
- [x] Test: changing year persists across page refresh (localStorage)
- [x] Test: year stays consistent when navigating between pages

### 1.9 User Profile & Session Management
- [x] Create `src/components/layout/user-menu.tsx` — user profile dropdown in sidebar footer (above theme toggle):
  - Display user avatar: uploaded image if available, otherwise initials derived from user name (e.g., "JD" for "John Doe")
  - Initials avatar: circular badge with primary background color, white text, consistent sizing
  - Show user name and email below/beside avatar
  - Dropdown menu with:
    - "Profile" link → opens profile settings
    - "Log out" button → calls `signOut()` from auth-client, redirects to `/login`
- [x] Create `src/app/(app)/profile/page.tsx` — user profile management page:
  - **Display name:** editable text field, updates `user.name` via Better Auth
  - **Email:** displayed read-only
  - **Avatar upload:**
    - Click-to-upload on avatar area
    - Accept image files only (PNG, JPG, WEBP), max 2MB
    - Crop/resize to 256px square webp on upload (client-side canvas)
    - Store as base64 data URL in `user.image` field (Better Auth's built-in column)
    - Show preview before saving
    - "Remove avatar" button to revert to initials
  - **Change password:** current password + new password + confirm new password fields
- [x] ~~Create `src/actions/profile.ts`~~ — not needed; profile page uses Better Auth client SDK directly (`updateUser`, `changePassword` from auth-client)
- [x] Create `src/components/ui/avatar-initials.tsx` — reusable avatar component:
  - Props: `name`, `image`, `size` (sm/md/lg)
  - If `image` is set: render `<img>` in circular container
  - If no image: extract first letter of first name + first letter of last name, render in colored circle
  - Fallback: single letter or generic user icon if no name
- [x] Integrate user menu into sidebar:
  - UserMenu + ThemeToggle in compact sidebar footer area
- [x] Profile accessible only via user dropdown menu (not in sidebar nav)
- [x] Test: log out clears session and redirects to `/login`
- [x] Test: initials avatar displays correctly for single-name and two-name users (verified "TU" for "Test User")
- [ ] Test: avatar upload stores image and displays on refresh *(deferred — needs test image file)*
- [x] Test: password change works with correct current password, rejects incorrect

---

## Phase 2: Dashboard & Accounts

### 2.1 Dashboard Data Fetching
- [x] Create `src/actions/dashboard.ts` with server actions:
  - [x] `getNetWorth(year)` — sum of all active account balances (stored balances), assets vs liabilities, month-over-month change
  - [x] `getMonthlyIncomeExpense(year)` — income vs spending per month for a year, filtered by INCOME_TYPES/SPENDING_TYPES
  - [x] `getSpendingByCategory(year, month)` — category breakdown for a given month, sorted by amount desc
  - [x] `getCreditUtilization()` — balance/limit/utilization % for each credit card, include owner name
  - [x] `getUpcomingBills(count)` — next N recurring bills by due date with days-until-due
  - [x] `getRecentTransactions(count)` — last N transactions across all accounts with account info
  - [x] `getMonthOverMonthChange(year)` — net change per month for a year

### 2.1b Dashboard Data Tests
- [x] Test: `getNetWorth()` returns correct assets, liabilities, and total for seeded data
- [x] Test: `getNetWorth()` excludes inactive accounts
- [x] Test: `getMonthlyIncomeExpense()` only includes INCOME_TYPES and SPENDING_TYPES (no transfers)
- [x] Test: `getSpendingByCategory()` groups and sorts categories by amount desc
- [x] Test: `getCreditUtilization()` returns correct balance/limit/utilization %
- [x] Test: `getUpcomingBills()` returns bills sorted by due date with correct days-until-due
- [x] Test: `getRecentTransactions()` returns correct count with account info
- [x] Test: `getMonthOverMonthChange()` calculates net change per month correctly

### 2.2 Dashboard Components
- [x] Create `src/components/dashboard/net-worth-card.tsx`
  - Total net worth with trend arrow (up/down vs last month)
  - Breakdown: total assets vs total liabilities
- [x] Create `src/components/dashboard/income-expense-chart.tsx`
  - Recharts BarChart or AreaChart showing monthly income vs expense for last 6-12 months
  - Toggle between 6/12 month views
  - Respects dark/light theme for chart colors
- [x] Create `src/components/dashboard/spending-breakdown.tsx`
  - Recharts PieChart / donut chart by category for current month
  - Legend with amounts
- [x] Create `src/components/dashboard/credit-utilization.tsx`
  - Progress bar for each credit card
  - Color coded: green (<30%), orange (30-70%), red (>70%)
  - Shows balance / limit and owner name
- [x] Create `src/components/dashboard/upcoming-bills.tsx`
  - List of next 5-10 bills with due date, amount, and payment account
  - Days until due indicator
  - Badge for variable-amount bills (estimated)
- [x] Create `src/components/dashboard/recent-transactions.tsx`
  - Last 10 transactions with date, description, amount, account, category
  - Color: green for income, red for expense, gray for transfer

### 2.3 Dashboard Page
- [x] Assemble `src/app/(app)/page.tsx` with all dashboard components in responsive grid layout
- [x] Ensure all data comes from server actions (no client-side fetching for initial load)
- [x] Add loading skeletons for each card (CardSkeleton + ChartSkeleton components)

### 2.3b Dashboard Page Tests
- [ ] Test: Dashboard page renders all widget components without errors *(deferred — requires jsdom environment + React component testing setup)*
- [ ] Test: Loading skeletons display while data is fetching *(deferred — requires jsdom environment)*
- [ ] Test: Dashboard correctly passes year context to data-fetching actions *(deferred — requires jsdom environment)*

### 2.4 Accounts Pages
- [x] Add `LOAN_TYPE_LABELS` and `APR_RATE_TYPE_LABELS` to `src/lib/constants.ts`
- [x] Create `src/actions/accounts.ts`:
  - [x] `getAccounts()` — all active accounts with balances, grouped by type (CHECKING, SAVINGS, CREDIT_CARD, LOAN, MORTGAGE order)
  - [x] `getAccount(id)` — single account with CC details, loan data, APR rates, last 20 transactions, 12-month balance history
  - [x] `createAccount(data)` — insert new account + nested CC details if CC + loan if loan/mortgage
  - [x] `updateAccount(id, data)` — update account + upsert CC/loan details
  - [x] `deleteAccount(id)` — soft delete (isActive = false), verify ownership
  - [x] `recalculateBalance(id)` — sum transactions, return stored vs calculated vs drift
  - [x] `confirmRecalculate(id)` — apply recalculated balance
  - [x] `getBalanceHistory(accountId, months)` — walk backwards from current balance subtracting monthly transaction sums
  - [ ] `recalculateAllBalances()` — recalculate for all active accounts, return drift report *(deferred to Task 2.5)*
- [x] Create `src/components/accounts/account-card.tsx`
  - Account name, type icon (Landmark/PiggyBank/CreditCard/HandCoins/Home), balance, owner name
  - Utilization bar with color thresholds if credit card
  - Entire card clickable (links to detail page)
- [x] Create `src/components/accounts/account-form.tsx`
  - Dialog form for add/edit account with controlled open/onOpenChange
  - Type select disabled in edit mode
  - Conditional CC fields (credit limit, statement close day, payment due day, grace period)
  - Conditional loan fields (loan type, original balance, interest rate, term, start date, monthly/extra payment)
  - Mortgage type: auto-sets loan type to MORTGAGE, hides loan type dropdown, shows "Mortgage Details" heading
  - Loan type: shows loan type dropdown filtered to Auto/Student/Personal, shows "Loan Details" heading
  - Toast notifications on success/error
- [x] Build `src/app/(app)/accounts/page.tsx`
  - Grid of account cards grouped by type with group totals
  - "Add Account" button opens form dialog
  - Skeleton loading state
  - Empty state with prompt to add first account
- [x] Create `src/components/accounts/balance-chart.tsx` — Recharts LineChart with theme-aware styling, abs values for debt accounts
- [x] Build `src/app/(app)/accounts/[id]/page.tsx`:
  - Account header with back link, name, type label, owner, edit/delete buttons
  - Balance display with recalculate button (shows stored vs calculated, drift, "Apply Correction" if drift ≠ 0)
  - Balance history line chart
  - Credit card details section (statement close/due day, grace period, last statement, min payment)
  - APR rates table (type badge, rate, effective/expiration dates)
  - Loan details section (type, original balance, rate, term, start date, monthly/extra payment)
  - Recent transactions list (reuses row layout from dashboard)

### 2.4b Accounts Tests
- [x] Test: `getAccounts()` returns accounts grouped by type in correct order
- [x] Test: `getAccounts()` only returns active accounts for the authenticated user
- [x] Test: `getAccount(id)` returns CC details, loan data, APR rates, transactions, and balance history
- [x] Test: `getAccount(id)` rejects access to another user's account
- [x] Test: `createAccount()` inserts account with nested CC details when type is CREDIT_CARD
- [x] Test: `createAccount()` inserts account with nested loan details when type is LOAN/MORTGAGE
- [x] Test: `createAccount()` creates opening balance transaction for non-zero balance
- [x] Test: `updateAccount()` updates account and upserts CC/loan details
- [x] Test: `deleteAccount(id)` soft-deletes (sets isActive = false)
- [x] Test: `deleteAccount(id)` rejects deletion of another user's account
- [x] Test: `recalculateBalance(id)` detects drift between stored and calculated balance
- [x] Test: `confirmRecalculate(id)` applies the corrected balance
- [x] Test: `getBalanceHistory()` returns correct month-by-month balances
- [ ] Test: Account detail page renders balance chart, CC details, APR rates, and recent transactions *(deferred — requires jsdom environment)*

### 2.5 Recalculate API
- [x] Add `recalculateAllBalances()` to `src/actions/accounts.ts` — returns drift report for all active accounts
- [x] Add `confirmRecalculateAll()` to `src/actions/accounts.ts` — applies corrections for all accounts with drift
- [x] Create `src/app/api/recalculate/route.ts`:
  - [x] POST with `{ accountId: string }` — recalculate single account, returns `{ result: { stored, calculated, drift } }`
  - [x] POST with `{ accountId, confirm: true }` — apply correction for single account
  - [x] POST with `{ all: true }` — recalculate all accounts, returns `{ results: [{ accountId, name, type, storedBalance, calculatedBalance, drift }] }`
  - [x] POST with `{ all: true, confirm: true }` — apply corrections for all accounts with drift
  - [x] Error handling for missing params and invalid account IDs

### 2.5b Recalculate API Tests
- [x] Test: POST with `{ accountId }` returns stored, calculated, and drift values
- [x] Test: POST with `{ accountId, confirm: true }` applies correction and updates balance
- [x] Test: POST with `{ all: true }` returns drift report for all active accounts
- [x] Test: POST with `{ all: true, confirm: true }` applies corrections only for accounts with drift
- [x] Test: Returns error for missing params and invalid account IDs

---

## Phase 3: Transactions & Intelligence

### 3.1 Transaction CRUD
- [x] Create `src/actions/transactions.ts`:
  - [x] `getTransactions(filters)` — paginated list with filters (account, category, type, date range, search, owner)
  - [x] `createTransaction(data)` — insert transaction + update account balance
  - [x] `updateTransaction(id, data)` — reverse old balance impact, apply new, update transaction
  - [x] `deleteTransaction(id)` — reverse balance impact, delete (also unlink if linked)
  - [x] `bulkCategorize(ids, category)` — update category for multiple transactions

### 3.1b Transaction CRUD Tests
- [x] Test: `getTransactions()` returns paginated results with correct total count (68 tests in `transactions.test.ts`)
- [x] Test: `getTransactions()` filters by account, category, type, date range, search, and owner
- [x] Test: `getTransactions()` only returns transactions for the authenticated user
- [x] Test: `createTransaction()` inserts transaction and updates account balance
- [x] Test: `createTransaction()` rejects transaction on another user's account
- [x] Test: `updateTransaction()` reverses old balance impact and applies new
- [x] Test: `deleteTransaction()` reverses balance impact and deletes record
- [x] Test: `deleteTransaction()` on a linked transfer unlinks/deletes the paired transaction
- [x] Test: `bulkCategorize()` updates category for multiple transactions

### 3.2 Transfer Wizard
- [ ] Create `src/actions/transfers.ts`:
  - [ ] `createTransfer(sourceAccountId, destAccountId, amount, date, description)`:
    - Creates Transaction A on source account (negative, type: transfer)
    - Creates Transaction B on destination account (positive, type: transfer)
    - Links A.linked_transaction_id = B.id and B.linked_transaction_id = A.id
    - Updates both account balances
    - All in a database transaction (atomic)
  - [ ] Handle all transfer scenarios:
    - Checking → Savings
    - Savings → Checking
    - Checking → Credit Card (CC payment)
    - Loan disbursement → Checking
- [ ] Create `src/components/transactions/transfer-wizard.tsx`:
  - Source account dropdown (with owner name)
  - Destination account dropdown (with owner name)
  - Amount input
  - Date picker
  - Description (auto-generated like "Transfer to Savings" but editable)

### 3.2b Transfer Wizard Tests
- [ ] Test: `createTransfer()` creates two linked transactions with correct types and amounts *(blocked — `transfers.ts` not yet implemented)*
- [ ] Test: `createTransfer()` updates both account balances atomically *(blocked)*
- [ ] Test: `createTransfer()` links A→B and B→A via `linked_transaction_id` *(blocked)*
- [ ] Test: Transfer transactions are typed as `TRANSFER` (not income/expense) *(blocked)*
- [ ] Test: Transfer wizard validates source ≠ destination account *(blocked — component not yet implemented)*
- [ ] Test: Transfer wizard shows owner names on account dropdowns *(blocked — component not yet implemented)*

### 3.3 Loan Payment Recording
- [ ] Create `src/actions/loan-payments.ts`:
  - [ ] `recordLoanPayment(loanId, paymentAmount, date, fromAccountId)`:
    - Calculate principal vs interest split using amortization formula from `loans.apr`
    - Create Transaction A on checking (negative, type: transfer, full amount)
    - Create Transaction B on loan account (positive, type: loan_principal, principal amount)
    - Create Transaction C on loan account (negative, type: loan_interest, interest amount)
    - Link A ↔ B
    - Update loan current_balance and remaining_months
    - Update checking account balance
    - Log interest to interest_log
    - All in a database transaction (atomic)
- [ ] Create `src/components/transactions/loan-payment-form.tsx`:
  - Loan selector dropdown
  - Payment amount (pre-filled with monthly_payment)
  - From account dropdown (defaults to checking)
  - Date picker
  - Shows calculated principal/interest split before confirming

### 3.3b Loan Payment Tests
- [ ] Test: `recordLoanPayment()` calculates correct principal/interest split from amortization formula *(blocked — `loan-payments.ts` not yet implemented)*
- [ ] Test: `recordLoanPayment()` creates transfer transaction on checking and principal+interest transactions on loan *(blocked)*
- [ ] Test: `recordLoanPayment()` links checking transaction to loan principal transaction *(blocked)*
- [ ] Test: `recordLoanPayment()` updates loan balance and remaining months *(blocked)*
- [ ] Test: `recordLoanPayment()` updates checking account balance *(blocked)*
- [ ] Test: `recordLoanPayment()` logs interest to `interest_log` *(blocked)*
- [ ] Test: Loan payment form pre-fills with monthly payment amount *(blocked — component not yet implemented)*
- [ ] Test: Loan payment form shows calculated split before confirming *(blocked — component not yet implemented)*

### 3.4 Per-Transaction APR Management
- [ ] Create `src/actions/apr-rates.ts`:
  - [ ] `getAprRates(accountId)` — all rates for a credit card (active and expired)
  - [ ] `createAprRate(data)` — add a new rate to a credit card
  - [ ] `updateAprRate(id, data)` — edit rate
  - [ ] `deleteAprRate(id)` — soft delete (is_active = false)
- [ ] Add APR rate selector to transaction form when account is credit card:
  - Dropdown showing active rates for the selected CC account
  - "Standard rate" as default
  - Option to create a new rate inline (e.g., "Add 0% intro rate")
- [ ] Create APR rates management section on account detail page:
  - List of all rates (active + expired) with type, rate, effective/expiration dates
  - Add/edit/deactivate rates
  - Show which transactions are using each rate

### 3.4b APR Management Tests
- [ ] Test: `getAprRates()` returns all rates (active and expired) for a credit card *(blocked — `apr-rates.ts` not yet implemented)*
- [ ] Test: `createAprRate()` adds a new rate to a credit card *(blocked)*
- [ ] Test: `updateAprRate()` edits rate details *(blocked)*
- [ ] Test: `deleteAprRate()` soft-deletes (sets `is_active = false`) *(blocked)*
- [ ] Test: APR rate selector shows only active rates for the selected CC account *(blocked — component not yet implemented)*
- [ ] Test: APR rates management section displays rates with correct type badges *(blocked — component not yet implemented)*

### 3.5 Transaction List Page
- [ ] Create `src/components/transactions/transaction-filters.tsx`:
  - Account filter (multi-select, shows owner names)
  - Category filter (multi-select)
  - Type filter (income/expense/transfer/all)
  - Date range picker
  - Search input (description)
  - Owner filter
  - Clear filters button
- [ ] Create `src/components/transactions/transaction-table.tsx`:
  - Sortable columns: date, description, amount, category, account, type
  - Color coding by type
  - Linked transaction indicator (chain icon) — click to see the paired transaction
  - APR rate badge on CC transactions
  - Inline category editing
  - Checkbox selection for bulk actions
- [ ] Create `src/components/transactions/transaction-form.tsx`:
  - Smart form that adapts fields based on entry type
  - Tabs: Expense | Income | Transfer | Loan Payment
  - Expense/Income tabs: standard fields + APR rate selector if CC account
  - Transfer tab: opens transfer wizard
  - Loan Payment tab: opens loan payment form
- [ ] Build `src/app/transactions/page.tsx`:
  - Filter bar at top
  - Transaction table with pagination (server-side)
  - Add transaction button → opens form dialog
  - Bulk categorize selected transactions

### 3.5b Transaction List Page Tests
- [ ] Test: Transaction table renders with correct columns and color coding by type *(blocked — components not yet implemented)*
- [ ] Test: Filters (account, category, type, date range, search, owner) correctly narrow results *(blocked)*
- [ ] Test: Pagination works with server-side data *(blocked)*
- [ ] Test: Linked transaction indicator shows and navigates to paired transaction *(blocked)*
- [ ] Test: Bulk categorize updates category for all selected transactions *(blocked)*
- [ ] Test: Transaction form adapts fields based on selected tab (Expense/Income/Transfer/Loan Payment) *(blocked)*

### 3.6 Verification
- [x] Test: Create expense on CC → only shows in expense totals, balance updated *(covered by `transactions.test.ts` + `dashboard.test.ts`)*
- [ ] Test: Create CC payment from checking → shows as transfer, excluded from totals, both balances updated *(blocked — `transfers.ts` not yet implemented)*
- [ ] Test: Create checking → savings transfer → both sides excluded from income/expense *(blocked — `transfers.ts` not yet implemented)*
- [ ] Test: Create loan payment → principal excluded, interest shows as expense, loan balance updated *(blocked — `loan-payments.ts` not yet implemented)*
- [x] Test: Delete a linked transfer → both sides deleted, both balances reversed *(covered by `transactions.test.ts`)*
- [x] Test: Edit transaction amount → old balance reversed, new balance applied *(covered by `transactions.test.ts`)*
- [ ] Test: Dashboard totals match expected values after all scenarios *(deferred — integration/E2E test)*
- [ ] Test: Per-transaction APR rates display correctly on transactions *(blocked — `apr-rates.ts` not yet implemented)*

---

## Phase 4: Loans & Interest

### 4.1 Loan CRUD
- [ ] Create `src/actions/loans.ts`:
  - [ ] `getLoans()` — all loans with account data
  - [ ] `getLoan(id)` — single loan with full detail
  - [ ] `createLoan(data)` — create account (type: loan/mortgage) + loan record
  - [ ] `updateLoan(id, data)` — update loan details
  - [ ] `deleteLoan(id)` — soft delete account

### 4.2 Amortization Engine
- [ ] Create amortization functions in `src/lib/calculations.ts`:
  - [ ] `calculatePaymentSplit(balance, apr, monthlyPayment)` → { principal, interest }
  - [ ] `generateAmortizationSchedule(balance, apr, monthlyPayment, remainingMonths)` → array of { month, payment, principal, interest, remainingBalance }
  - [ ] `calculateExtraPaymentImpact(balance, apr, monthlyPayment, extraMonthly)` → { newPayoffMonths, interestSaved, newTotalInterest }
  - [ ] `calculateTotalInterestPaid(loanId)` — sum from interest_log for this loan
  - [ ] `calculateTotalInterestRemaining(balance, apr, monthlyPayment)` — sum of interest in remaining schedule

### 4.3 Loan Pages
- [ ] Create `src/components/loans/loan-card.tsx`:
  - Loan name, type icon, lender
  - Balance / original principal progress bar
  - APR display
  - Monthly payment amount
  - Estimated payoff date
- [ ] Create `src/components/loans/loan-form.tsx` — add/edit loan dialog
- [ ] Build `src/app/loans/page.tsx`:
  - Grid of loan cards
  - Summary bar: total debt, total monthly payments, weighted average APR
- [ ] Create `src/components/loans/amortization-table.tsx`:
  - Full schedule: month, payment, principal, interest, remaining balance
  - Highlight current month
  - Running totals for interest paid / principal paid
- [ ] Create `src/components/loans/extra-payment-calc.tsx`:
  - Input: extra monthly amount
  - Output: months saved, interest saved, new payoff date
  - Comparison chart (with vs without extra payments)
- [ ] Build `src/app/loans/[id]/page.tsx`:
  - Loan header with key stats
  - Payment history (transactions for this loan account)
  - Amortization table
  - Extra payment calculator
  - Interest paid to date vs remaining chart

### 4.4 Interest Tracking — Cron Jobs
- [ ] Implement `cron/src/jobs/interest-cc.ts`:
  - Runs daily at midnight
  - For each active credit card:
    - Load credit_card_details (grace period, statement status)
    - Load all unpaid expense transactions on this card
    - For each transaction:
      - Look up apr_rate (or fall back to account default apr)
      - Call `shouldChargeInterest()` — check grace period
      - If yes, calculate daily interest: `abs(amount) * (apr / 100 / 365)`
    - Sum daily interest across all transactions
    - Write daily accumulator (can store in a daily_interest_accrual table or accumulate in memory)
    - On month end: write total to interest_log + create interest_charged transaction + update balance
- [ ] Implement `cron/src/jobs/interest-savings.ts`:
  - Runs monthly on 1st
  - For each savings account: `balance * (apy / 100 / 12)`
  - Write to interest_log
  - Create interest_earned transaction
  - Update savings account balance
- [ ] Implement `cron/src/jobs/statement-close.ts`:
  - Runs daily at midnight
  - For each CC where today = statement_close_day:
    - Snapshot balance to last_statement_balance
    - Check if prior statement was paid in full (compare payments received vs last_statement_balance)
    - Update last_statement_paid_in_full flag
- [ ] Implement `cron/src/jobs/apr-expiration.ts`:
  - Runs daily at midnight
  - Find apr_rates where expiration_date <= today AND is_active = true
  - Set is_active = false
  - For transactions still using the expired rate, reassign to the account's active standard rate
- [ ] Create interest summary component for dashboard:
  - Total interest paid this month/year across all debts
  - Total interest earned this month/year on savings
  - Net interest (earned - paid)

---

## Phase 5: Recurring Bills, Budgets & Import

### 5.1 Recurring Bills
- [ ] Create `src/actions/recurring.ts`:
  - [ ] `getRecurringBills()` — all active bills with payment account info
  - [ ] `createRecurringBill(data)` — insert bill (including is_variable_amount flag)
  - [ ] `updateRecurringBill(id, data)` — update (amount always editable)
  - [ ] `deleteRecurringBill(id)` — soft delete (is_active = false)
  - [ ] `getUpcomingBills(days: number)` — bills due in next N days
  - [ ] `confirmVariableBill(transactionId, actualAmount)` — update pending variable bill transaction with real amount
- [ ] Create `src/components/recurring/bill-card.tsx`
  - Name, amount, due day, payment account, frequency
  - Badge: "Fixed" or "Variable (estimated)" based on is_variable_amount
  - Edit amount inline
- [ ] Create `src/components/recurring/bill-form.tsx`
  - Add/edit bill dialog
  - Toggle for is_variable_amount
  - When variable: label amount as "Estimated amount"
- [ ] Create `src/components/recurring/bills-calendar.tsx` — month view showing which days bills are due
- [ ] Build `src/app/recurring/page.tsx`:
  - List/grid of all recurring bills
  - Calendar view toggle
  - Group by payment account
  - Total monthly recurring cost (with note: "X bills are estimated")
  - Section for pending variable bills needing confirmation
- [ ] Implement auto-generation in `cron/src/jobs/recurring-bills.ts`:
  - Daily check at 6 AM
  - For each active bill with auto_generate = true:
    - If due_day matches today (or passed since last generated for this period)
    - If is_variable_amount = false: create expense transaction with exact amount
    - If is_variable_amount = true: create expense transaction marked as pending (add `is_pending` boolean to transactions, or use notes field as flag)
    - Tag with source='recurring' and link recurring_bill_id
    - Update account balance (for non-pending only)

### 5.2 Budgets
- [ ] Create `src/actions/budgets.ts`:
  - [ ] `getBudgets(period)` — budgets for a month with actual spending calculated
  - [ ] `createBudget(data)` — insert budget
  - [ ] `updateBudget(id, data)` — update limit
  - [ ] `deleteBudget(id)` — delete
  - [ ] `getBudgetVsActual(period)` — for each budget, return limit and actual spending
  - [ ] `copyBudgets(fromPeriod, toPeriod)` — copy budget entries from one month to another
- [ ] Create `src/components/budgets/budget-bar.tsx`:
  - Category name
  - Progress bar: actual / limit
  - Color: green (<80%), orange (80-100%), red (>100%)
  - Remaining amount or overage amount
- [ ] Create `src/components/budgets/budget-form.tsx` — add/edit budget dialog
- [ ] Build `src/app/budgets/page.tsx`:
  - Month selector
  - Grid of budget bars
  - Total budgeted vs total spent
  - Add budget button
  - Copy budgets from previous month / set as default

### 5.3 CSV Import (Flexible 3-Pattern Support)
- [ ] Create `src/actions/import.ts`:
  - [ ] `parseCSV(fileContent)` — parse CSV string into rows, handle common encoding issues
  - [ ] `detectAmountPattern(headers, sampleRows)` — auto-detect which of the 3 patterns:
    - Pattern 1: single signed amount column
    - Pattern 2: separate debit/credit columns
    - Pattern 3: amount + type indicator column
    - Return detected pattern + suggested column mappings
  - [ ] `detectColumns(headers)` — auto-detect date, description, and amount columns by name heuristics
  - [ ] `normalizeAmounts(rows, pattern, columnMapping)` — convert any pattern to signed amounts (negative = debit, positive = credit)
  - [ ] `detectDuplicates(transactions, accountId)` — compare against existing:
    - Exact match: same date + same amount + same description → flag as duplicate
    - Fuzzy match: same date + same amount + similar description (Levenshtein < 3) → flag for review
    - No match: mark as new
  - [ ] `importTransactions(transactions, accountId)` — bulk insert confirmed transactions + update account balance
- [ ] Create `src/components/import/csv-uploader.tsx`:
  - Drag & drop or file picker for CSV
  - Preview first 5 rows in a table
  - Select target account from dropdown
- [ ] Create `src/components/import/column-mapper.tsx`:
  - Auto-detected pattern shown with option to override
  - **Pattern 1 UI:** map date column, amount column, description column
  - **Pattern 2 UI:** map date column, debit column, credit column, description column
  - **Pattern 3 UI:** map date column, amount column, type indicator column, description column + specify debit/credit indicator values
  - Optional: category column mapping
  - Live preview of mapped + normalized data (5 rows)
- [ ] Create `src/components/import/import-preview.tsx`:
  - Full list of parsed + normalized transactions
  - Duplicate flags (exact match: red "Duplicate", fuzzy: yellow "Review", new: green "New")
  - Checkbox to include/exclude each row
  - Auto-categorization suggestions based on description matching existing transactions
  - Summary: X new, Y duplicates, Z for review
  - Confirm import button
- [ ] Build `src/app/import/page.tsx` — step wizard: Upload → Map Columns → Preview & Review → Confirm

---

## Phase 6: Bank Connectivity (Plaid)

### 6.1 Plaid Setup
- [ ] Create Plaid developer account and get sandbox credentials
- [ ] Add PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV to .env
- [ ] Install Plaid SDK: `pnpm add plaid`
- [ ] Create `src/lib/plaid.ts` — Plaid client configuration

### 6.2 Schema Addition
- [ ] Add `plaid_connections` table to schema:
  - id, access_token (encrypted), item_id, institution_name, last_synced, cursor, status, created_at
- [ ] Run migration

### 6.3 Plaid API Routes
- [ ] Create `src/app/api/plaid/create-link-token/route.ts`:
  - Call Plaid linkTokenCreate
  - Return link token to frontend
- [ ] Create `src/app/api/plaid/exchange-token/route.ts`:
  - Exchange public token for access token
  - Store encrypted access token in plaid_connections
  - Fetch account info and create/link account records
- [ ] Create `src/app/api/plaid/sync/route.ts`:
  - Call Plaid transactionsSync with stored cursor
  - Map Plaid transactions to app transaction format
  - Auto-categorize using Plaid categories
  - Run duplicate detection against existing transactions
  - Insert new, flag duplicates for review

### 6.4 Plaid Connection UI
- [ ] Build connection section in `src/app/settings/page.tsx`:
  - "Connect Bank" button → opens Plaid Link
  - List of connected institutions with last sync time
  - Manual sync trigger button per connection
  - Disconnect option (with confirmation)

### 6.5 Plaid Sync Cron Job
- [ ] Implement `cron/src/jobs/plaid-sync.ts`:
  - Runs every 6 hours
  - For each active plaid_connection: call sync endpoint
  - Handle errors gracefully (expired tokens, rate limits)

### 6.6 Sync Duplicate Handling
- [ ] Create review queue UI (can be a section on transactions page or a separate view):
  - List of flagged potential duplicates from Plaid sync
  - Show Plaid transaction alongside potential match
  - Actions: "It's a match" (skip/merge), "It's new" (import), "Ignore"

---

## Phase 7: Settings & Polish

### 7.1 Settings Page
- [ ] Build `src/app/settings/page.tsx`:
  - [ ] **Account & Profile:** Link to `/profile` page for name, avatar, and password management (implemented in Task 1.9)
  - [ ] **Theme:** Dark/light mode toggle (redundant with sidebar toggle but accessible here too)
  - [ ] **Categories:** Add/rename/delete custom categories
  - [ ] **Disclaimer:** Full disclaimer text displayed in a card/section, with note about first-launch acknowledgment
  - [ ] **Recalculate All Balances:** Button that recalculates all account balances from transactions, shows drift report, confirm to apply
  - [ ] **Seed Data:**
    - "Wipe All Data" button with double confirmation (type "DELETE" to confirm)
    - "Load Demo Data" button to re-seed
  - [ ] **Database Backup:** Trigger manual backup, list recent backups with download links
  - [ ] **Data Export:** Download all data as JSON or CSV
  - [ ] **Plaid Connections** (Phase 6 — show placeholder until implemented)

### 7.2 Polish & UX
- [ ] Add toast notifications for all CRUD operations (using sonner)
- [ ] Add confirmation dialogs for all destructive actions
- [ ] Add loading skeletons for all data-fetching components
- [ ] Responsive design: test and fix all pages at mobile/tablet/desktop widths
- [ ] Add keyboard shortcuts (Ctrl+N for new transaction, Ctrl+K for search, etc.)
- [ ] Error boundaries for graceful error handling
- [ ] Empty states for all list pages (no accounts yet, no transactions, etc.)
- [ ] Ensure all charts render correctly in both dark and light themes

### 7.3 Performance
- [ ] Add database indexes if query performance degrades (review slow query log)
- [ ] Implement server-side pagination for transaction list
- [ ] Use React Suspense boundaries for streaming dashboard data
- [ ] Optimize Recharts renders with React.memo

---

## Non-Functional Tasks

### Testing Setup
- [ ] Install Jest and testing dependencies
  ```bash
  pnpm add -D jest ts-jest @types/jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom
  ```
- [ ] Create `jest.config.ts` with TypeScript support, path aliases (`@/`), and jsdom environment
- [ ] Create `jest.setup.ts` with `@testing-library/jest-dom` matchers
- [ ] Add test scripts to `package.json`:
  ```json
  {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test"
  }
  ```
- [ ] Install Playwright for E2E tests
  ```bash
  pnpm add -D @playwright/test
  pnpm exec playwright install
  ```
- [ ] Create `playwright.config.ts` with base URL `http://localhost:3000`, webServer config for dev server
- [ ] Create `e2e/` directory at project root for Playwright specs
- [ ] E2E script already added above: `"test:e2e": "playwright test"` (run via `pnpm test:e2e`)

### Unit Tests — Financial Calculations (`src/lib/`)
- [ ] `calculations.test.ts` — amortization schedule generation
- [ ] `calculations.test.ts` — `calculatePaymentSplit()` accuracy against known amortization tables
- [ ] `calculations.test.ts` — `calculateExtraPaymentImpact()` months saved and interest saved
- [ ] `calculations.test.ts` — APR-to-daily-rate conversion precision
- [ ] `calculations.test.ts` — edge cases: zero balance, zero APR, final payment rounding
- [ ] `utils.test.ts` — currency formatting, date helpers, uid generator

### Unit Tests — Server Actions (`src/actions/`)
- [x] `transactions.test.ts` — CRUD operations with mocked Prisma Client (68 tests)
- [ ] `transfers.test.ts` — transfer pairs created atomically with correct `linked_transaction_id`
- [ ] `transfers.test.ts` — both balances updated, both transactions typed as `transfer`
- [ ] `loan-payments.test.ts` — principal/interest split matches amortization formula
- [ ] `loan-payments.test.ts` — loan balance and remaining months updated correctly
- [ ] `dashboard.test.ts` — `getMonthlyIncomeExpense()` only includes correct transaction types
- [ ] `dashboard.test.ts` — `getNetWorth()` sums all active account balances
- [ ] `dashboard.test.ts` — transfers never appear in income or expense totals
- [ ] `accounts.test.ts` — `recalculateBalance()` detects and corrects drift
- [ ] `budgets.test.ts` — `getBudgetVsActual()` sums only spending types per category
- [ ] `recurring.test.ts` — `confirmVariableBill()` updates pending transaction with actual amount
- [ ] `import.test.ts` — `detectAmountPattern()` correctly identifies all 3 CSV patterns
- [ ] `import.test.ts` — `detectDuplicates()` exact match, fuzzy match (Levenshtein < 3), and no-match
- [ ] `import.test.ts` — `normalizeAmounts()` produces correct signed values for each pattern
- [ ] `apr-rates.test.ts` — APR rate CRUD and expiration logic

### Unit Tests — Cron Jobs (`cron/src/jobs/`)
- [ ] `interest-cc.test.ts` — daily interest accrual uses correct per-transaction APR
- [ ] `interest-cc.test.ts` — grace period respected: no interest when prior statement paid in full
- [ ] `interest-cc.test.ts` — expired APR falls back to standard rate
- [ ] `interest-savings.test.ts` — monthly interest earned calculated from APY
- [ ] `statement-close.test.ts` — statement balance snapshot and paid-in-full flag set correctly
- [ ] `apr-expiration.test.ts` — expired rates deactivated, transactions reassigned to standard rate
- [ ] `recurring-bills.test.ts` — fixed bills generate exact-amount transactions with `source = 'recurring'`
- [ ] `recurring-bills.test.ts` — variable bills generate pending transactions for confirmation

### Component Tests (`src/components/`)
- [ ] Dashboard widgets render correct data from mocked server actions
- [ ] Transaction table applies filters and displays correct type color coding
- [ ] Transfer wizard validates source ≠ destination and shows both account owners
- [ ] Loan payment form shows calculated principal/interest split before confirming
- [ ] Budget bars render correct progress and color thresholds (green/orange/red)
- [ ] CSV column mapper displays correct UI for each detected amount pattern
- [ ] Import preview flags duplicates with correct badges (red/yellow/green)
- [ ] Disclaimer modal blocks interaction until accepted, persists to localStorage
- [ ] Account form shows conditional fields based on account type (CC details, loan fields)
- [ ] Bill form toggles between fixed and variable amount modes

### E2E Tests — Playwright (`e2e/`)
- [ ] `dashboard.spec.ts` — dashboard loads with correct net worth, income/expense chart, and recent transactions
- [ ] `transactions.spec.ts` — create an expense, verify it appears in table and updates account balance
- [ ] `transfers.spec.ts` — create a transfer between accounts, verify both sides appear, balances updated, excluded from totals
- [ ] `loan-payment.spec.ts` — record a loan payment, verify principal/interest split, loan balance updated
- [ ] `import.spec.ts` — upload a CSV file, map columns, review duplicates, confirm import
- [ ] `recurring.spec.ts` — create a recurring bill, verify it appears in list and calendar
- [ ] `budgets.spec.ts` — create a budget, add spending, verify progress bar updates
- [ ] `settings.spec.ts` — wipe data, re-seed, verify fresh data loads
- [ ] `theme.spec.ts` — toggle dark/light mode, verify charts and components render in both themes
- [ ] `disclaimer.spec.ts` — fresh load shows disclaimer, accept persists, cleared storage re-shows

### Integration Verification
- [x] Test Docker build and startup from clean state (all 3 containers)
- [x] Test seed data wipe and regeneration via both CLI and API routes
- [x] Test cron container connects to DB and logs job registration on startup

### Documentation
- [ ] README.md with:
  - Project overview
  - Prerequisites (Docker, Docker Compose)
  - Setup instructions (`docker compose up --build`)
  - Environment variables reference
  - How to access the app
  - How to run seed data
  - How to backup/restore
- [ ] Document how to add new transaction categories
- [ ] Document how to set up APR rates for a credit card
- [ ] Document how to configure credit card grace periods
- [ ] Document how to restore from backup
- [ ] Document Plaid setup steps for Phase 6
- [ ] Document CSV import patterns supported
