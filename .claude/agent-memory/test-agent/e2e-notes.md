# E2E Test Notes

## Files Created

| File | Coverage |
|---|---|
| `e2e/helpers.ts` | `login()` and `acceptDisclaimer()` shared helpers |
| `e2e/dashboard.spec.ts` | Net Worth card, Income/Expense chart, Recent Transactions, Upcoming Bills, Credit Utilization, sidebar nav |
| `e2e/transactions.spec.ts` | Page load, table render, Add Transaction dialog tabs, create expense, create income, filter bar |
| `e2e/transfers.spec.ts` | Transfer Wizard opens via dialog > Transfer tab, form fields, create transfer, dashboard unaffected |
| `e2e/loan-payment.spec.ts` | Loans page metrics, loan card links, detail page amortization/extra-payment calc, Loan Payment Form, breakdown preview |
| `e2e/import.spec.ts` | Import wizard step 1 (upload + account select), CSV preview, continue to mapping, column mapper step |
| `e2e/recurring.spec.ts` | Page load, Add Bill dialog, form fields, create bill appears in list, grid/calendar view toggle, summary bar |
| `e2e/budgets.spec.ts` | Page load, month nav, Add Budget dialog, create budget triggers progress bar, summary bar, period changes |
| `e2e/settings.spec.ts` | All 7 sections visible, create custom category, Wipe All Data requires "DELETE" confirmation, Export buttons |
| `e2e/theme.spec.ts` | Toggle flips dark class on `<html>`, double-toggle returns to original, localStorage persistence, Settings page toggle |
| `e2e/disclaimer.spec.ts` | Modal appears when key absent, Escape/backdrop does NOT dismiss, accept dismisses, localStorage persisted, reappears after key cleared |

## Patterns Used

- `test.skip()` inside a test body used to gracefully skip when demo seed may not provide the required data
- `page.addInitScript()` used in disclaimer tests to control localStorage before page load
- File upload in import spec uses `fileInput.setInputFiles(path)` on the hidden `input[type="file"]`
- Transfers/Loan Payment Wizards are opened via the Add Transaction dialog tabs, not via a direct URL
- The transfer description is auto-generated as "Transfer: AccountA → AccountB"

## Auth / Global Setup (IMPORTANT)

- Better Auth has **rate limiting** on sign-in — multiple simultaneous logins trigger "Too many requests"
- Solution: `e2e/global-setup.ts` logs in ONCE, saves `storageState` to `e2e/.auth/user.json`
- `playwright.config.ts` sets `use: { storageState: "e2e/.auth/user.json" }` globally
- `login()` in `helpers.ts` now just navigates to "/" and trusts the injected session
- The disclaimer localStorage key is set in globalSetup AND in `login()` via `addInitScript` (belt+suspenders)
- `e2e/.auth/` directory must exist (add to .gitignore or keep `user.json` placeholder)
- Disclaimer tests use `page.addInitScript` to REMOVE the key — use a sessionStorage flag guard so `addInitScript` only fires once (not on reload), else reload re-clears the accepted state

## Strict Mode Violations (Common Patterns)

The app renders many pages with TWO h1 headings (one in the sticky banner, one in main content).
Fix: Always scope heading assertions to `page.getByRole("main")`:
```ts
await expect(page.getByRole("main").getByRole("heading", { name: "Budgets" })).toBeVisible()
```

Settings section titles (Account & Profile, Appearance, Categories, etc.) are NOT heading roles —
they are plain text inside generic divs. Use `page.getByText(...)` instead of `getByRole("heading")`.

Dashboard widget labels (Net Worth, Income vs Expenses, Recent Transactions, Upcoming Bills,
Credit Utilization) are also NOT heading roles — use `page.getByText(...)`.

The sticky banner contains a year combobox. When on the import page, `page.getByRole("combobox").first()`
picks up the year combobox, NOT the account selector. Always scope to `page.getByRole("main")`:
```ts
await page.getByRole("main").getByRole("combobox").first().click()
```

The "Toggle theme" button appears TWICE on the settings page (sidebar + settings section).
Scope to the specific section to avoid strict mode:
```ts
await page.getByRole("complementary").getByRole("button", { name: /toggle theme/i }) // sidebar
await page.locator("#theme").getByRole("button", { name: /toggle theme/i })           // settings section
```

`getByText(/previous month/i)` matches both the "Previous month" nav arrow AND "Copy from Previous Month"
button on the Budgets page. Use `{ name: "Previous month", exact: true }`.

## Running

```bash
pnpm exec playwright test e2e/          # all specs
pnpm exec playwright test e2e/dashboard.spec.ts  # single spec
pnpm exec playwright test --ui          # interactive UI mode
```

Requires the app to be running at localhost:3000 (or `webServer` in playwright.config.ts starts it automatically via `pnpm dev`).
