# Test Agent Memory

## Test Runner
- **Vitest** (not Jest) — run with `pnpm exec vitest run <path>`
- Config: `vitest.config.ts` at project root
- Include pattern: `src/**/*.test.ts` (covers `__tests__/` subdirectories)
- Setup file: `src/test/setup.ts` (currently just a placeholder)
- `@` alias maps to `src/`

## Mock Patterns for Server Actions
See [patterns.md](patterns.md) for the full Prisma + auth mock setup.

Key points:
- Mock `next/headers`, `@/lib/auth`, and `@/db` using `vi.mock()` hoisted before imports
- `prisma.$transaction` mock must execute the callback: `vi.fn((fn) => fn(txClient))`
- Store the `txClient` on the prisma mock as `_txClient` so tests can assert on inner calls
- Prisma Decimal fields are plain objects in source — mock them as `{ toNumber: () => n }`
- `auth.api.getSession` returning `null` triggers the "Unauthorized" error path

## Project Test File Location
- Tests live in `__tests__/` subdirectories next to the source file
- Naming: `*.test.ts` for logic, `*.test.tsx` for components
- E2E: `e2e/` at project root (Playwright, not yet written)
