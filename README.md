# PersonalLedgr

A self-hosted finance app that actually knows the difference between spending money and moving it around.

## Key Features

- **Multi-account tracking** -- checking, savings, credit cards, loans, and mortgages in one place
- **Transfers vs. income/expense** -- transfers between your own accounts are never counted as income or spending
- **Loan amortization** -- automatic principal/interest split with amortization schedules and extra payment calculators
- **Credit card interest tracking** -- per-transaction APR rates, daily interest accrual, grace period support
- **Recurring bills** -- fixed and variable recurring transactions with automatic generation
- **Budgets** -- category-based budget tracking with visual progress bars
- **CSV import** -- flexible column mapping with duplicate detection
- **Dark/light theme** -- system-aware theme with manual toggle
- **Multi-user** -- self-registration with username/password authentication
- **Fully self-hosted** -- runs entirely on your own hardware via Docker

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

## Quick Start

```bash
git clone https://github.com/your-username/PersonalLedgr.git
cd PersonalLedgr
cp .env.example .env
# Edit .env and set BETTER_AUTH_SECRET (generate with: openssl rand -base64 32)
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000) and register your first account.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/personalledgr?schema=public` |
| `POSTGRES_PASSWORD` | Password for the PostgreSQL `postgres` user | `postgres` |
| `BETTER_AUTH_SECRET` | Secret key for session signing (required -- generate with `openssl rand -base64 32`) | -- |
| `BETTER_AUTH_URL` | Public URL of the app | `http://localhost:3000` |
| `APP_PORT` | Host port mapped to the app container | `3000` |

## Demo Data

Seed the database with sample accounts, transactions, and recurring bills:

```bash
pnpm db:seed
```

Demo credentials: **demo@personalledgr.local** / `testpassword123`

To wipe all data and start fresh:

```bash
pnpm db:wipe
```

## Development

### Local setup (without Docker)

```bash
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate dev
pnpm dev
```

### Running tests

```bash
pnpm test          # unit / integration tests
pnpm test:e2e      # end-to-end tests
```

### Database management

```bash
pnpm exec prisma migrate dev      # create and apply migrations
pnpm exec prisma migrate deploy   # apply migrations (production)
pnpm exec prisma studio           # open Prisma Studio GUI
```

## Architecture

PersonalLedgr runs as three Docker containers:

| Container | Image | Purpose |
|---|---|---|
| **app** | Next.js (standalone) | Web application, API routes, server actions |
| **db** | PostgreSQL 18.1 Alpine | Primary data store |
| **cron** | Node.js Alpine + node-cron | Scheduled jobs: interest accrual, statement cycles, recurring bill generation, APR expiration cleanup |

All containers are orchestrated with Docker Compose. The `app` and `cron` containers both connect to the shared `db` container. A named volume (`pgdata`) persists database data across restarts.

## Tech Stack

- **Framework:** Next.js 15 (App Router, TypeScript, standalone output)
- **Database:** PostgreSQL 16 with Prisma ORM
- **Authentication:** Better Auth (email/password, Prisma adapter)
- **Styling:** Tailwind CSS 4, shadcn/ui (neutral base)
- **Charts:** Recharts
- **Icons:** lucide-react
- **Theme:** next-themes (dark/light with system detection)

## Core Principle

> Money moving between your own accounts is never income or expense -- it is always a transfer.

This drives the entire transaction type system. Transfers, loan principal payments, and similar movements are always excluded from income and expense totals. Only actual earnings (income, interest earned) count as income, and only actual costs (expenses, loan interest, interest charged) count as spending.

## License

[AGPL-3.0](LICENSE)

## Disclaimer

PersonalLedgr is provided "as is" without warranty of any kind. It is **not** a substitute for professional financial, tax, or legal advice. The developer is not responsible for data loss, inaccurate calculations, misreported balances, or any financial decisions made based on information displayed by this application. All financial data should be independently verified against your bank and institution statements. By using PersonalLedgr, you acknowledge that you use the software at your own risk. See [Docs/DISCLAIMER.md](Docs/DISCLAIMER.md) for the full disclaimer.
