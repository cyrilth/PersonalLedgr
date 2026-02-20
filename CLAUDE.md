# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PersonalLedgr is a self-hosted personal finance app built with Next.js 15 (App Router), PostgreSQL 16, and Prisma ORM. It runs in Docker Compose with three containers: `app` (Next.js), `db` (PostgreSQL), `cron` (scheduled jobs). Authentication via Better Auth with username/password credentials. Multi-user with registration.

**License:** AGPL-3.0

## Workflow Rules

- **Never commit without explicit user approval.** Always ask before running `git commit`, `git push`, or any other git write operation.

## Build & Run Commands

```bash
# Start all services
docker compose up --build

# Database migrations
pnpm exec prisma migrate dev      # create and apply migration in development
pnpm exec prisma migrate deploy   # apply migrations in production
pnpm exec prisma generate         # regenerate Prisma Client after schema changes
pnpm exec prisma studio           # open Prisma Studio GUI

# Seed data
pnpm db:seed             # populate demo data (tsx src/db/seed.ts)
pnpm db:wipe             # clear all data (tsx src/db/wipe-seed.ts)

# Development
pnpm dev                 # Next.js dev server
```

## Tech Stack

- **Package Manager:** pnpm (use `pnpm` instead of `npm`/`npx` for all commands)
- **Framework:** Next.js 15 with App Router, TypeScript, `output: 'standalone'`
- **Auth:** Better Auth with email/password, Prisma adapter
- **Database:** PostgreSQL 16 (Docker), Prisma ORM
- **Styling:** Tailwind CSS 4, shadcn/ui components (neutral base)
- **Charts:** Recharts
- **Icons:** lucide-react
- **Theme:** next-themes (dark/light with system detection, `darkMode: "class"`)
- **Color scheme:** Emerald green primary, semantic finance colors (green=income, red=expense, blue=transfer)
- **Cron container:** Separate Node.js Alpine image with `node-cron`, connects directly to DB

## Core Architecture Principle

**Money moving between your own accounts is never income or expense — it is always a transfer.**

This principle drives the entire transaction type system and query logic:

```sql
-- Real income:  WHERE type IN ('income', 'interest_earned')
-- Real spending: WHERE type IN ('expense', 'loan_interest', 'interest_charged')
-- Transfers are ALWAYS excluded from income/expense totals
```

## Transaction Types

| Type | Counts as Spending | Counts as Income |
|---|---|---|
| `income` | No | Yes |
| `expense` | Yes | No |
| `transfer` | No | No |
| `loan_principal` | No | No |
| `loan_interest` | Yes | No |
| `interest_earned` | No | Yes |
| `interest_charged` | Yes | No |

## Key Design Decisions

1. **No separate backend** — Next.js API routes and server actions handle all server logic
2. **Linked transactions** — `linked_transaction_id` self-referential FK ties both sides of a transfer (atomic, bidirectional)
3. **Stored balances** — account balances updated on every transaction write; recalculate button available for drift reconciliation
4. **Per-transaction APR** — credit card purchases can each have different APR rates via `apr_rates` table
5. **Credit card grace period** — tracked in `credit_card_details`; no interest on purchases if prior statement paid in full
6. **Account ownership** — `owner` field for household member tracking within a user's account
7. **Variable recurring bills** — `is_variable_amount` flag; estimated bills prompt for confirmation when generated
8. **Transaction source tracking** — every transaction tagged as `manual`, `import`, `plaid`, `recurring`, or `system`
9. **Mortgage/loan payment auto-split** — system calculates principal vs interest from amortization schedule

## Project Structure

```
src/
  app/                    # Next.js App Router pages
    api/
      auth/[...all]/      # Better Auth API route handler
      seed/               # Seed data API
      recalculate/        # Balance recalculation API
      plaid/              # Plaid integration (Phase 6)
    (auth)/               # Auth route group (clean layout, no sidebar)
      login/              # Login page
      register/           # Registration page
    (app)/                # App route group (sidebar + header + footer layout)
      accounts/[id]/      # Account detail pages
      loans/[id]/         # Loan detail pages
      transactions/
      recurring/
      budgets/
      import/
      settings/
      profile/              # User profile management (name, avatar, password)
  actions/                # Server actions (dashboard, accounts, transactions, profile, etc.)
  lib/
    auth.ts               # Better Auth server configuration
    auth-client.ts        # Better Auth client (signIn, signUp, signOut, useSession)
  proxy.ts               # Route protection via Next.js 16 proxy (redirect unauthenticated to /login)
  components/
    layout/               # Sidebar, header, footer, theme-toggle, user-menu
    ui/
      avatar-initials.tsx # Reusable avatar component (image or initials fallback)
    dashboard/            # Dashboard widget components
    accounts/             # Account cards, forms, charts
    transactions/         # Transaction table, filters, forms, transfer wizard
    loans/                # Loan cards, amortization table, extra payment calc
    recurring/            # Bill cards, forms, calendar
    budgets/              # Budget bars, forms
    import/               # CSV uploader, column mapper, preview
  db/
    index.ts              # Database connection (PrismaClient singleton)
    seed.ts               # Demo data seeder
    wipe-seed.ts          # Data wiper
  lib/
    constants.ts          # Category list, transaction type enums, format helpers
    utils.ts              # Currency formatting, date helpers, uid generator
    calculations.ts       # Amortization engine, payment split, interest calculations
    plaid.ts              # Plaid client configuration (Phase 6)
prisma/
  schema.prisma           # Prisma schema (all models and enums)
cron/
  src/
    index.ts              # Entry point registering all cron jobs
    db.ts                 # Database connection (reuses schema types)
    jobs/
      interest-cc.ts      # Daily CC interest accrual
      interest-savings.ts # Monthly savings interest
      statement-close.ts  # Daily CC statement cycle processing
      apr-expiration.ts   # Daily expired APR rate cleanup
      recurring-bills.ts  # Daily recurring bill generation
      plaid-sync.ts       # Plaid sync every 6 hours (Phase 6)
```

## CSV Import Patterns

The import system supports three amount column patterns:
1. **Single signed amount** — one column with positive/negative values
2. **Separate debit/credit columns** — two columns
3. **Amount + type indicator** — amount column plus a column indicating debit/credit

Duplicate detection uses exact match (date+amount+description) and fuzzy match (Levenshtein distance < 3).

## Disclaimer Requirement

The disclaimer must appear in three places: first-launch acknowledgment modal (localStorage-gated), app footer, and settings page. See `Docs/DISCLAIMER.md` for full text.
