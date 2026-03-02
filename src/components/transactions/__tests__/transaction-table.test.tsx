// @vitest-environment jsdom
/**
 * Tests for TransactionTable component.
 *
 * Covers:
 * - Empty state rendering
 * - Data display (description, account, type badge)
 * - Amount color coding per transaction type
 * - Checkbox selection (single, select-all, deselect-all)
 * - Linked transfer icon visibility
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TransactionTable } from "../transaction-table"

function makeTransaction(
  overrides: Partial<Parameters<typeof TransactionTable>[0]["transactions"][0]> = {}
) {
  return {
    id: "txn-1",
    date: "2026-01-15T00:00:00.000Z",
    description: "Grocery Store",
    amount: -50,
    type: "EXPENSE",
    category: "Groceries",
    source: "MANUAL",
    notes: null,
    accountId: "acc-1",
    account: { id: "acc-1", name: "Checking", type: "CHECKING" },
    linkedTransactionId: null,
    ...overrides,
  }
}

describe("TransactionTable", () => {
  const defaultProps = {
    selectedIds: new Set<string>(),
    onSelectChange: vi.fn(),
    onCategoryChange: vi.fn(),
    categories: ["Groceries", "Dining Out", "Utilities"],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows empty state when no transactions", () => {
    render(<TransactionTable {...defaultProps} transactions={[]} />)
    expect(screen.getByText("No transactions found.")).toBeInTheDocument()
  })

  it("renders transaction description", () => {
    render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ description: "Whole Foods" })]}
      />
    )
    // Component renders both mobile card and desktop table views, so text appears twice
    expect(screen.getAllByText("Whole Foods").length).toBeGreaterThan(0)
  })

  it("renders account name", () => {
    render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ account: { id: "acc-1", name: "Chase Checking", type: "CHECKING" } })]}
      />
    )
    expect(screen.getAllByText("Chase Checking").length).toBeGreaterThan(0)
  })

  it("renders type badge for EXPENSE", () => {
    render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ type: "EXPENSE" })]}
      />
    )
    expect(screen.getAllByText("Expense").length).toBeGreaterThan(0)
  })

  it("renders type badge for INCOME", () => {
    render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ type: "INCOME", amount: 2000 })]}
      />
    )
    expect(screen.getAllByText("Income").length).toBeGreaterThan(0)
  })

  it("renders type badge for TRANSFER", () => {
    render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ type: "TRANSFER", amount: 500 })]}
      />
    )
    expect(screen.getAllByText("Transfer").length).toBeGreaterThan(0)
  })

  it("applies text-negative class for EXPENSE amounts", () => {
    const { container } = render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ type: "EXPENSE", amount: -50 })]}
      />
    )
    expect(container.querySelector(".text-negative")).toBeInTheDocument()
  })

  it("applies text-positive class for INCOME amounts", () => {
    const { container } = render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ type: "INCOME", amount: 1000 })]}
      />
    )
    expect(container.querySelector(".text-positive")).toBeInTheDocument()
  })

  it("renders category badge when category is set", () => {
    render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ category: "Groceries" })]}
      />
    )
    expect(screen.getAllByText("Groceries").length).toBeGreaterThan(0)
  })

  it("renders em dash when no category", () => {
    const { container } = render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ category: null })]}
      />
    )
    // The italic em-dash span
    expect(container.querySelector(".italic")).toBeInTheDocument()
  })

  it("shows link icon for linked transactions", () => {
    const { container } = render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ linkedTransactionId: "txn-2" })]}
      />
    )
    // Link2 icon renders as an svg inside a span with title
    const linkSpan = container.querySelector(`[title="Linked transfer"]`)
    expect(linkSpan).toBeInTheDocument()
  })

  it("does not show link icon for unlinked transactions", () => {
    const { container } = render(
      <TransactionTable
        {...defaultProps}
        transactions={[makeTransaction({ linkedTransactionId: null })]}
      />
    )
    expect(container.querySelector(`[title="Linked transfer"]`)).not.toBeInTheDocument()
  })

  it("calls onSelectChange when individual checkbox is clicked", () => {
    const onSelectChange = vi.fn()
    render(
      <TransactionTable
        {...defaultProps}
        onSelectChange={onSelectChange}
        transactions={[makeTransaction({ id: "txn-1" })]}
      />
    )
    // The row checkboxes are all inputs of type checkbox
    const checkboxes = screen.getAllByRole("checkbox")
    // First is the "select all" header checkbox, second is the row checkbox
    fireEvent.click(checkboxes[1])
    expect(onSelectChange).toHaveBeenCalledOnce()
    const calledWith = onSelectChange.mock.calls[0][0] as Set<string>
    expect(calledWith.has("txn-1")).toBe(true)
  })

  it("calls onSelectChange with all IDs when select-all is clicked", () => {
    const onSelectChange = vi.fn()
    render(
      <TransactionTable
        {...defaultProps}
        onSelectChange={onSelectChange}
        transactions={[
          makeTransaction({ id: "txn-1" }),
          makeTransaction({ id: "txn-2", description: "Coffee" }),
        ]}
      />
    )
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0]) // header "select all"
    expect(onSelectChange).toHaveBeenCalledOnce()
    const calledWith = onSelectChange.mock.calls[0][0] as Set<string>
    expect(calledWith.has("txn-1")).toBe(true)
    expect(calledWith.has("txn-2")).toBe(true)
  })

  it("deselects all when header checkbox is clicked while all selected", () => {
    const onSelectChange = vi.fn()
    render(
      <TransactionTable
        {...defaultProps}
        selectedIds={new Set(["txn-1"])}
        onSelectChange={onSelectChange}
        transactions={[makeTransaction({ id: "txn-1" })]}
      />
    )
    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[0])
    expect(onSelectChange).toHaveBeenCalledOnce()
    const calledWith = onSelectChange.mock.calls[0][0] as Set<string>
    expect(calledWith.size).toBe(0)
  })

  it("renders multiple transactions", () => {
    render(
      <TransactionTable
        {...defaultProps}
        transactions={[
          makeTransaction({ id: "1", description: "Amazon Purchase" }),
          makeTransaction({ id: "2", description: "Gas Station" }),
          makeTransaction({ id: "3", description: "Paycheck", type: "INCOME", amount: 3000 }),
        ]}
      />
    )
    expect(screen.getAllByText("Amazon Purchase").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Gas Station").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Paycheck").length).toBeGreaterThan(0)
  })
})
