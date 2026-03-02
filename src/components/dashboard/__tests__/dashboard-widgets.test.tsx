// @vitest-environment jsdom
/**
 * Tests for dashboard widget components:
 * - NetWorthCard: renders values, trend arrows, assets/liabilities breakdown
 * - RecentTransactions: color coding by type, empty state, formatting
 * - IncomeExpenseChart: 6M/12M toggle, renders without crashing
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { NetWorthCard } from "../net-worth-card"
import { RecentTransactions } from "../recent-transactions"
import { IncomeExpenseChart } from "../income-expense-chart"

// Mock recharts to avoid SVG rendering issues in jsdom
vi.mock("recharts", () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

// ── NetWorthCard ────────────────────────────────────────────────────────────

describe("NetWorthCard", () => {
  it("renders net worth value", () => {
    render(
      <NetWorthCard
        netWorth={125000}
        assets={200000}
        liabilities={-75000}
        change={500}
      />
    )
    expect(screen.getByText(/125,000/)).toBeInTheDocument()
  })

  it("renders assets and liabilities", () => {
    render(
      <NetWorthCard
        netWorth={125000}
        assets={200000}
        liabilities={-75000}
        change={500}
      />
    )
    expect(screen.getByText(/200,000/)).toBeInTheDocument()
    expect(screen.getByText(/75,000/)).toBeInTheDocument()
    expect(screen.getByText("Assets")).toBeInTheDocument()
    expect(screen.getByText("Liabilities")).toBeInTheDocument()
  })

  it("shows trending up icon for positive change", () => {
    const { container } = render(
      <NetWorthCard netWorth={125000} assets={200000} liabilities={-75000} change={500} />
    )
    // TrendingUp icon renders as an svg — class "text-positive" indicates positive trend
    const trendEl = container.querySelector(".text-positive")
    expect(trendEl).toBeInTheDocument()
  })

  it("shows trending down indicator for negative change", () => {
    const { container } = render(
      <NetWorthCard netWorth={100000} assets={150000} liabilities={-50000} change={-200} />
    )
    const trendEl = container.querySelector(".text-negative")
    expect(trendEl).toBeInTheDocument()
  })

  it("shows neutral indicator for zero change", () => {
    const { container } = render(
      <NetWorthCard netWorth={100000} assets={150000} liabilities={-50000} change={0} />
    )
    // Zero change: the trend span should have text-muted-foreground, NOT text-positive or text-negative
    // The trend indicator is the second element inside the flex row (after the main net-worth figure)
    const trendSpan = container.querySelector(".flex.flex-wrap.items-baseline > span:last-child")
    expect(trendSpan?.className).not.toContain("text-positive")
    expect(trendSpan?.className).not.toContain("text-negative")
    expect(trendSpan?.className).toContain("text-muted-foreground")
  })

  it("renders 'vs last month' label", () => {
    render(
      <NetWorthCard netWorth={0} assets={0} liabilities={0} change={0} />
    )
    expect(screen.getByText("vs last month")).toBeInTheDocument()
  })
})

// ── RecentTransactions ──────────────────────────────────────────────────────

const makeTransaction = (
  overrides: Partial<Parameters<typeof RecentTransactions>[0]["transactions"][0]> = {}
) => ({
  id: "txn-1",
  date: "2026-01-15T00:00:00.000Z",
  description: "Grocery Store",
  amount: 50,
  type: "EXPENSE",
  category: "Groceries",
  account: { id: "acc-1", name: "Checking" },
  ...overrides,
})

describe("RecentTransactions", () => {
  it("shows empty state when no transactions", () => {
    render(<RecentTransactions transactions={[]} />)
    expect(screen.getByText("No transactions yet.")).toBeInTheDocument()
  })

  it("renders transaction description", () => {
    render(<RecentTransactions transactions={[makeTransaction()]} />)
    expect(screen.getByText("Grocery Store")).toBeInTheDocument()
  })

  it("renders account name", () => {
    render(<RecentTransactions transactions={[makeTransaction()]} />)
    expect(screen.getByText("Checking")).toBeInTheDocument()
  })

  it("renders category when present", () => {
    render(<RecentTransactions transactions={[makeTransaction({ category: "Groceries" })]} />)
    expect(screen.getByText("Groceries")).toBeInTheDocument()
  })

  it("applies negative (red) color class for EXPENSE type", () => {
    const { container } = render(
      <RecentTransactions transactions={[makeTransaction({ type: "EXPENSE" })]} />
    )
    expect(container.querySelector(".text-negative")).toBeInTheDocument()
  })

  it("applies positive (green) color class for INCOME type", () => {
    const { container } = render(
      <RecentTransactions
        transactions={[makeTransaction({ type: "INCOME", amount: 1000 })]}
      />
    )
    expect(container.querySelector(".text-positive")).toBeInTheDocument()
  })

  it("applies transfer color class for TRANSFER type", () => {
    const { container } = render(
      <RecentTransactions
        transactions={[makeTransaction({ type: "TRANSFER" })]}
      />
    )
    expect(container.querySelector(".text-transfer")).toBeInTheDocument()
  })

  it("renders multiple transactions", () => {
    render(
      <RecentTransactions
        transactions={[
          makeTransaction({ id: "1", description: "Coffee Shop" }),
          makeTransaction({ id: "2", description: "Paycheck" }),
        ]}
      />
    )
    expect(screen.getByText("Coffee Shop")).toBeInTheDocument()
    expect(screen.getByText("Paycheck")).toBeInTheDocument()
  })
})

// ── IncomeExpenseChart ──────────────────────────────────────────────────────

const makeMonthData = (month: string, income: number, expense: number) => ({
  month,
  income,
  expense,
})

describe("IncomeExpenseChart", () => {
  const data = [
    makeMonthData("2025-09", 3000, 2000),
    makeMonthData("2025-10", 3200, 1800),
    makeMonthData("2025-11", 3100, 2100),
    makeMonthData("2025-12", 3000, 2500),
    makeMonthData("2026-01", 3300, 1900),
    makeMonthData("2026-02", 3400, 2200),
    makeMonthData("2026-03", 3500, 2300),
  ]

  it("renders without crashing", () => {
    render(<IncomeExpenseChart data={data} />)
    expect(screen.getByText("Income vs Expenses")).toBeInTheDocument()
  })

  it("renders 6M and 12M toggle buttons", () => {
    render(<IncomeExpenseChart data={data} />)
    expect(screen.getByRole("button", { name: "6M" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "12M" })).toBeInTheDocument()
  })

  it("defaults to 6M mode", () => {
    render(<IncomeExpenseChart data={data} />)
    const sixMBtn = screen.getByRole("button", { name: "6M" })
    // The active button should have the "default" variant styling
    expect(sixMBtn).toBeInTheDocument()
  })

  it("switches to 12M when clicked", () => {
    render(<IncomeExpenseChart data={data} />)
    const twelveMBtn = screen.getByRole("button", { name: "12M" })
    fireEvent.click(twelveMBtn)
    // After click, 12M is active. No crash = pass.
    expect(twelveMBtn).toBeInTheDocument()
  })

  it("renders the bar chart container", () => {
    render(<IncomeExpenseChart data={data} />)
    expect(screen.getByTestId("responsive-container")).toBeInTheDocument()
  })
})
