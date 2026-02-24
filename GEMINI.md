# PersonalLedgr

## Project Overview

PersonalLedgr is a self-hosted personal finance web application built with Next.js 15 (App Router), PostgreSQL 16, and Prisma ORM. It runs via Docker Compose with three containers: the Next.js `app`, the PostgreSQL `db`, and a separate Node.js `cron` container for scheduled jobs. 

A core architectural principle of this application is that **money moving between your own accounts is never an income or expense — it is always a transfer**. The app features multi-account tracking (checking, savings, loans, credit cards), loan amortization, credit card interest tracking, recurring bills, budgeting, CSV importing, and multi-user support authenticated via Better Auth.

## Building and Running

The project utilizes `pnpm` as its package manager. Ensure Docker and Docker Compose are installed for the full stack environment.

### Docker Environment
Start all services (App, Database, Cron):
```bash
docker compose up --build
```

### Local Development
To run the Next.js development server locally (requires a running PostgreSQL instance):
```bash
pnpm install
pnpm exec prisma generate
pnpm exec prisma migrate dev
pnpm dev
```

### Database Management
- **Migrate (Dev):** `pnpm exec prisma migrate dev`
- **Migrate (Prod):** `pnpm exec prisma migrate deploy`
- **Generate Client:** `pnpm exec prisma generate`
- **Prisma Studio:** `pnpm exec prisma studio`
- **Seed Demo Data:** `pnpm db:seed`
- **Wipe All Data:** `pnpm db:wipe`

### Testing & Linting
- **Unit/Integration Tests:** `pnpm test`
- **Tests (Watch Mode):** `pnpm test:watch`
- **Test Coverage:** `pnpm test:coverage`
- **End-to-End Tests (Playwright):** `pnpm test:e2e`
- **Linting:** `pnpm lint`

## Development Conventions

- **Package Manager:** Always use `pnpm` for installing dependencies and running scripts.
- **Framework:** Next.js 15 with the App Router and TypeScript. Configured for `standalone` output for Docker.
- **Styling:** Tailwind CSS 4 and `shadcn/ui` components using a neutral base. The app uses `next-themes` for system-aware dark/light mode (`darkMode: "class"`).
- **Icons & Charts:** `lucide-react` for icons and `Recharts` for data visualization.
- **Authentication:** Managed by Better Auth (email/password credentials) using the Prisma adapter. Unauthenticated users are redirected to `/login` via route protection.
- **Data Layer:** Uses Prisma ORM. No separate backend exists; server logic is handled directly in Next.js API routes and Server Actions.
- **Transaction Logic:** Transaction totals and types must strictly adhere to the core principle: `transfer`, `loan_principal` are excluded from income/expense. Real income includes `income`, `interest_earned`. Real spending includes `expense`, `loan_interest`, `interest_charged`.
- **Git Workflow:** Do not commit without explicit user approval.
