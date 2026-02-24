# jsdom Component Test Patterns

## Setup File (`src/test/setup.ts`)

```typescript
import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
})

// Polyfill ResizeObserver (used by Radix UI Switch, Tooltip, etc.)
if (typeof window !== "undefined" && !window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Polyfill PointerEvent (used by Radix UI interactive components)
if (typeof window !== "undefined" && !window.PointerEvent) {
  window.PointerEvent = class PointerEvent extends MouseEvent {
    constructor(type, params = {}) { super(type, params) }
  }
}
```

## Recharts Mock

```typescript
vi.mock("recharts", () => ({
  BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div />,
  Cell: () => <div />,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div />,
}))
```

## Sonner Toast Mock

```typescript
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))
```

## ScrollArea Mock (avoids ResizeObserver in some contexts)

```typescript
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }) => <div data-testid="scroll-area">{children}</div>,
}))
```

## Common Gotchas

### Tailwind JIT class selectors fail
```typescript
// WRONG: querySelector fails for modifier classes
container.querySelector(".[&>div]:bg-emerald-500")

// RIGHT: check innerHTML string
expect(container.innerHTML).toContain("bg-emerald-500")
```

### Labels with asterisk child spans
The pattern `<Label>Text <span>*</span></Label>` breaks `getByLabelText("Text")`:
```typescript
// WRONG: fails when label has <span>*</span> child
screen.getByLabelText("Amount Column")

// RIGHT: use getByText or getElementById
screen.getByText(/Amount Column/)
document.getElementById("amount-col")
```

### "Select All" vs "Deselect All" ambiguity
`getByRole("button", { name: /select all/i })` also matches "Deselect All" since the regex is a substring match.
```typescript
// WRONG:
screen.getByRole("button", { name: /select all/i })

// RIGHT: use exact strings
screen.getByRole("button", { name: "Select All" })
screen.getByRole("button", { name: "Deselect All" })
```

### Cleanup between tests
Vitest does NOT auto-cleanup between tests by default. Always import `cleanup` in `afterEach` in `src/test/setup.ts` (done globally — no need to repeat in each file).

### Dialogs with portals
shadcn Dialog/Sheet render into portals. When `open={true}`, the content IS accessible via `screen` queries without needing special portal handling in RTL. Mock portals only if the component itself fails to render.

## Components Tested (10 jsdom files, as of 2026-02)

| File | Component | Tests |
|------|-----------|-------|
| `dashboard/__tests__/dashboard-widgets.test.tsx` | NetWorthCard, RecentTransactions, IncomeExpenseChart | 19 |
| `transactions/__tests__/transaction-table.test.tsx` | TransactionTable | 16 |
| `transactions/__tests__/transfer-wizard.test.tsx` | TransferWizard | 9 |
| `loans/__tests__/loan-payment-form.test.tsx` | LoanPaymentForm | 13 |
| `budgets/__tests__/budget-bars.test.tsx` | BudgetBar | 15 |
| `import/__tests__/csv-column-mapper.test.tsx` | ColumnMapper | 13 |
| `import/__tests__/import-preview.test.tsx` | ImportPreview | 17 |
| `__tests__/disclaimer-modal.test.tsx` | DisclaimerModal | 9 |
| `accounts/__tests__/account-form.test.tsx` | AccountForm | 16 |
| `recurring/__tests__/bill-form.test.tsx` | BillForm | 18 |
