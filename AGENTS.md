# Repository Guidelines

## Project Structure & Module Organization

PersonalLedgr is a self-hosted finance app built with Next.js, TypeScript, Prisma, and PostgreSQL. Main application code lives in `src/`, using the Next App Router for pages, API routes, server actions, UI components, and shared utilities. Database schema and migrations are managed through `prisma/`. Scheduled jobs for recurring bills, interest accrual, statement cycles, and cleanup live in `cron/`. End-to-end tests live in `e2e/`, while unit and integration tests are colocated as `*.test.ts` or `*.test.tsx` under `src/` and `cron/src/`. Project documentation is kept in `Docs/`.

## Build, Test, and Development Commands

Use `pnpm install` to install dependencies. Run `pnpm dev` for the local Next.js development server at `http://localhost:3000`. Use `pnpm build` to create a production build and `pnpm start` to run it. Run `pnpm lint` for ESLint checks. Database helpers include `pnpm exec prisma generate`, `pnpm exec prisma migrate dev`, `pnpm db:seed`, and `pnpm db:wipe`. Docker-based local startup is available with `docker compose up --build`.

## Coding Style & Naming Conventions

Write TypeScript with `strict` mode in mind. Prefer the `@/` alias for imports from `src/`. Follow the existing style: double quotes, semicolons where already present, functional React components, and small server-side helpers for business logic. Use PascalCase for React components and types, camelCase for functions and variables, and uppercase enum values when matching Prisma enums. Keep finance calculations explicit and avoid converting decimal money values to floating point unless the surrounding code already does so safely.

## Testing Guidelines

Vitest is used for unit and integration tests with a Node environment and shared setup in `src/test/setup.ts`. Test files should be named `*.test.ts` or `*.test.tsx` and stay near the code they cover. Run `pnpm test` for the full Vitest suite, `pnpm test:watch` while developing, and `pnpm test:coverage` when checking coverage impact. Playwright tests run with `pnpm test:e2e`; the config starts `pnpm dev` and targets Chromium.

## Commit & Pull Request Guidelines

Keep commits focused and written in imperative style, for example `Fix recurring bill due date rollover` or `Add loan payment tests`. Before opening a pull request, run `pnpm lint`, `pnpm test`, and any relevant Playwright tests. PR descriptions should summarize the change, call out schema or migration effects, link issues when applicable, and include screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit `.env` files or secrets. Use `.env.example` as the template and set `BETTER_AUTH_SECRET` locally. Treat financial calculations and transaction classification as high-risk changes; verify balances, transfers, interest, and recurring bill behavior with tests.
