# PersonalLedgr — Project Plan

> A self-hosted finance app that actually knows the difference between spending money and moving it around.

## License

AGPL-3.0 — Free to use, modify, and self-host. Anyone who runs a modified version as a service must open-source their changes under the same license. Commercial licensing available for organizations that need different terms.

## Disclaimer

See [DISCLAIMER.md](DISCLAIMER.md). PersonalLedgr is provided "as is" without warranty. The developer is not responsible for data loss, inaccurate calculations, misreported balances, or financial decisions made based on information displayed by this application. Displayed in three places: first-launch acknowledgment screen, app footer, and settings page.

## Overview

A self-hosted personal finance application to track all household money flow: income, expenses, credit cards, personal loans, mortgage, and savings. The core differentiator is **transaction intelligence** — the system automatically prevents double-counting when money moves between your own accounts (credit card payments, loan disbursements, savings transfers).

## Guiding Principle

> **Money moving between your own accounts is never income or expense. It is always a transfer.**

- Loan disbursement → checking = transfer (NOT income)
- Checking → savings = transfer (NOT expense)
- Savings → checking = transfer (NOT income)
- Checking → credit card payment = transfer (NOT expense)
- Credit card charge at a merchant = real expense
- Paycheck → checking = real income
- Mortgage payment = split into principal (transfer) + interest (real expense)

## Infrastructure

| Component | Choice |
|---|---|
| Host | Proxmox → LXC container (nesting=1, keyctl=1) |
| Deployment | Docker Compose inside LXC |
| Containers | 3: `app` (Next.js), `db` (PostgreSQL), `cron` (scheduled jobs) |
| Access | LAN only (`http://<lxc-ip>:3000`) |
| Auth | Better Auth — email/password with registration |
| Resources | ~1-2 GB RAM, 2 cores, 10 GB disk |

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | Full-stack: UI + API routes + server actions |
| Database | PostgreSQL 16 (Docker) | Relational integrity, aggregation queries |
| ORM | Prisma ORM | Type-safe, auto-generated client, excellent migrations and schema DSL |
| Auth | Better Auth | Email/password auth, Prisma adapter, session management, proxy-based route protection |
| Styling | Tailwind CSS 4 | Utility-first, first-class Next.js support |
| Charts | Recharts | Flexible React charting for dashboards |
| UI Components | shadcn/ui | Polished, accessible, customizable |
| Background Jobs | Separate cron container | Lightweight Node.js scripts for scheduled tasks |
| Bank Sync | Plaid (Phase 6) | Industry standard, via Next.js API routes |
| Language | TypeScript | End-to-end type safety |
| Theme | Dark + Light mode | Toggle with system preference detection |
| Color Scheme | Emerald green primary | Finance-appropriate, semantic money colors |

## Transaction Type System

| Type | Counts as Spending? | Counts as Income? | Examples |
|---|---|---|---|
| `income` | No | **Yes** | Paycheck, freelance, dividends |
| `expense` | **Yes** | No | Groceries, dining, bills charged to CC |
| `transfer` | No | No | Checking↔savings, CC payment, loan disbursement |
| `loan_principal` | No | No | Principal portion of loan/mortgage payment |
| `loan_interest` | **Yes** | No | Interest portion of loan/mortgage payment |
| `interest_earned` | No | **Yes** | Savings APY payout |
| `interest_charged` | **Yes** | No | Credit card interest charge |

### Query Rules

```sql
-- Real income
WHERE type IN ('income', 'interest_earned')

-- Real spending
WHERE type IN ('expense', 'loan_interest', 'interest_charged')

-- Transfers are ALWAYS excluded from income/expense totals
```

## Key Design Decisions

1. **No separate backend** — Next.js API routes and server actions handle all server-side logic
2. **Username/password auth** — Better Auth with email/password, Prisma adapter for user/session storage, registration page for multi-user support
3. **Linked transactions** — `linked_transaction_id` self-referential FK ties both sides of a transfer
4. **Auto-split loan payments** — system calculates principal vs interest from amortization schedule
5. **Separate cron container** — lightweight Docker container with its own Node.js scripts for scheduled jobs (interest calc, recurring bills, backups, Plaid sync), connects directly to the database
6. **Transaction source tracking** — every transaction tagged as `manual`, `import`, `plaid`, `recurring`, or `system`
7. **Stored balances (Option A)** — account balances updated on every transaction write for fast reads. UI provides recalculate button (per-account on detail page + global in settings) to reconcile from transaction history if drift occurs
8. **Per-transaction APR** — credit card purchases can each have different APR rates (0% intro, balance transfer rate, standard rate, penalty rate) tracked via an `apr_rates` table linked to transactions
9. **Credit card grace period** — `credit_card_details` table tracks statement cycle, grace period days (default 25 if unknown), and last statement balance. No interest charged on purchases if prior statement was paid in full by due date
10. **Account ownership** — `owner` field on accounts for household member tracking (e.g., "Chase Sapphire - John" vs "Chase Sapphire - Jane"). All data scoped to the authenticated user
11. **Dark + light mode** — both supported with system preference detection and manual toggle, persisted to localStorage
12. **Emerald green color scheme** — primary brand color is emerald (light: emerald-600, dark: emerald-500). Semantic finance colors: green for income/gains/under-budget, red for expenses/losses/over-budget, blue for transfers. Chart palette uses 5 distinguishable colors tuned per mode. Neutral gray for backgrounds, cards, borders, and muted text
13. **Seed data wipe** — settings page includes one-click option to clear all demo/seed data
14. **Variable recurring bills** — all recurring bill amounts are editable. `is_variable_amount` flag indicates estimated vs fixed amounts; estimated bills prompt user to confirm/edit actual amount when generated
15. **Flexible CSV import** — column mapper supports negative numbers, separate debit/credit columns, and credit/debit indicator column patterns

## Pages

| Route | Purpose |
|---|---|
| `/login` | Login page — username/password form |
| `/register` | Registration page — create new account |
| `/` | Dashboard — net worth, income/expense chart, spending breakdown, credit utilization, upcoming bills |
| `/transactions` | Transaction list with search, filter, add/edit/delete, transfer wizard |
| `/accounts` | All accounts with balances, utilization, and owner names |
| `/accounts/[id]` | Account detail — transaction history, balance chart, interest, recalculate button |
| `/loans` | Loans overview — progress bars, payoff projections |
| `/loans/[id]` | Loan detail — amortization table, extra payment calculator |
| `/recurring` | Recurring bills management with due dates, editable amounts, variable bill flag |
| `/budgets` | Category budgets vs actual spending |
| `/import` | CSV import with flexible column mapping (3 patterns) and duplicate detection |
| `/settings` | Categories, theme toggle, recalculate all balances, wipe seed data, Plaid connections (Phase 6), backup/restore |

## Build Phases

| Phase | Focus | Timeline |
|---|---|---|
| 1 | Foundation — scaffolding, Docker (3 containers), DB schema, seed data | Week 1-2 |
| 2 | Dashboard & Accounts — charts, account pages, balance recalculation | Week 3-4 |
| 3 | Transactions — smart entry, transfer linking, per-txn APR, duplicate prevention | Week 5-6 |
| 4 | Loans & Interest — amortization, grace periods, interest tracking, calculators | Week 7-8 |
| 5 | Recurring Bills, Budgets & CSV Import | Week 9-10 |
| 6 | Bank Connectivity — Plaid/SimpleFIN auto-sync | Week 11-12 |
| 7 | Settings & Polish — theme toggle, seed wipe, keyboard shortcuts, responsive | Week 13 |
