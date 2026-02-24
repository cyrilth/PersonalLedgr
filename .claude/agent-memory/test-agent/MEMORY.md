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
- E2E: `e2e/` at project root — 10 spec files written, see [e2e-notes.md](e2e-notes.md)
- Cron job tests: `cron/src/jobs/__tests__/` — vitest.config.ts now includes `cron/src/**/*.test.ts`
- vitest.config.ts include: `["src/**/*.test.ts", "src/**/*.test.tsx", "cron/src/**/*.test.ts"]`

## jsdom Component Test Patterns
See [jsdom-patterns.md](jsdom-patterns.md) for full details.

Key points:
- Use `// @vitest-environment jsdom` directive at top of each `.test.tsx` file
- `src/test/setup.ts` imports `@testing-library/jest-dom/vitest`, runs `cleanup()` in `afterEach`, and polyfills `ResizeObserver` and `PointerEvent`
- Mock `recharts` with simple div wrappers to avoid SVG issues in jsdom
- Mock `sonner` toast: `vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))`
- `getByLabelText` fails when label has child `<span>` for asterisk — use `getByText(/label text/)` or `document.getElementById("input-id")` instead
- Tailwind JIT modifier classes like `[&>div]:bg-emerald-500` cannot be queried with `querySelector` — check `container.innerHTML` for the string instead
- `getByRole("button", { name: /select all/i })` matches "Deselect All" too — use exact name strings to disambiguate

## E2E Key Facts
- Playwright config: `playwright.config.ts`, baseURL = http://localhost:3000, testDir = `./e2e`
- Demo credentials: demo@personalledgr.local / testpassword123
- Disclaimer localStorage key: `personalledgr-disclaimer-accepted`
- Use `acceptDisclaimer(page)` helper after `login(page)` in beforeEach
- Transfer Wizard opens from Add Transaction dialog > Transfer tab > "Open Transfer Wizard" button
- Loan Payment Form opens from Add Transaction dialog > Loan Payment tab > "Open Loan Payment Form" button
