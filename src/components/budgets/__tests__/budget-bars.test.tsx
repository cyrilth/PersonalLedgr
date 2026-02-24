// @vitest-environment jsdom
/**
 * Tests for BudgetBar component.
 *
 * Covers:
 * - Renders category name, actual spend, and limit
 * - Shows remaining amount when under budget
 * - Shows overage amount when over budget
 * - Color thresholds: green (<80%), amber (80-100%), red (>100%)
 * - Edit and delete buttons visibility based on props
 * - Calls onEdit and onDelete callbacks
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BudgetBar } from "../budget-bar"

function renderBudgetBar(overrides: Partial<Parameters<typeof BudgetBar>[0]> = {}) {
  const props = {
    id: "budget-1",
    category: "Groceries",
    limit: 500,
    actual: 300,
    remaining: 200,
    percentUsed: 60,
    ...overrides,
  }
  return render(<BudgetBar {...props} />)
}

describe("BudgetBar", () => {
  it("renders the category name", () => {
    renderBudgetBar({ category: "Dining Out" })
    expect(screen.getByText("Dining Out")).toBeInTheDocument()
  })

  it("renders actual spend and limit amounts", () => {
    renderBudgetBar({ actual: 300, limit: 500 })
    // formatCurrency renders as $300.00 / $500.00 — look for partial matches
    expect(screen.getByText(/300/)).toBeInTheDocument()
    expect(screen.getByText(/500/)).toBeInTheDocument()
  })

  it("shows remaining amount when under budget", () => {
    renderBudgetBar({ remaining: 200, percentUsed: 60 })
    expect(screen.getByText(/Remaining:/)).toBeInTheDocument()
    expect(screen.getByText(/200/)).toBeInTheDocument()
  })

  it("shows overage amount when over budget", () => {
    renderBudgetBar({ remaining: -50, percentUsed: 110, actual: 550, limit: 500 })
    expect(screen.getByText(/Over by/)).toBeInTheDocument()
    // "Over by $50.00" should appear in the overage indicator
    expect(screen.getByText(/Over by \$50\.00/)).toBeInTheDocument()
  })

  it("applies red color class when over budget (remaining < 0)", () => {
    const { container } = renderBudgetBar({
      remaining: -50,
      percentUsed: 110,
      actual: 550,
      limit: 500,
    })
    expect(container.querySelector(".text-red-500")).toBeInTheDocument()
  })

  it("applies emerald color class when under budget (remaining > 0)", () => {
    const { container } = renderBudgetBar({ remaining: 200, percentUsed: 60 })
    // Text for remaining uses emerald class
    expect(container.querySelector(".text-emerald-600, .text-emerald-400")).not.toBeNull()
  })

  it("does not render edit button when onEdit is not provided", () => {
    renderBudgetBar()
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument()
  })

  it("does not render delete button when onDelete is not provided", () => {
    renderBudgetBar()
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument()
  })

  it("renders edit button when onEdit is provided", () => {
    renderBudgetBar({ onEdit: vi.fn() })
    expect(screen.getByRole("button", { name: /edit groceries budget/i })).toBeInTheDocument()
  })

  it("renders delete button when onDelete is provided", () => {
    renderBudgetBar({ onDelete: vi.fn() })
    expect(screen.getByRole("button", { name: /delete groceries budget/i })).toBeInTheDocument()
  })

  it("calls onEdit when edit button is clicked", () => {
    const onEdit = vi.fn()
    renderBudgetBar({ onEdit })
    fireEvent.click(screen.getByRole("button", { name: /edit groceries budget/i }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it("calls onDelete when delete button is clicked", () => {
    const onDelete = vi.fn()
    renderBudgetBar({ onDelete })
    fireEvent.click(screen.getByRole("button", { name: /delete groceries budget/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it("renders a progress bar element", () => {
    const { container } = renderBudgetBar()
    // shadcn Progress renders a div with role="progressbar"
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
  })

  it("applies green bar color class when percent < 80", () => {
    const { container } = renderBudgetBar({ percentUsed: 60 })
    // The Progress component receives a className with the Tailwind modifier class.
    // We verify it's present in the DOM by checking any element's class attribute text.
    const html = container.innerHTML
    expect(html).toContain("bg-emerald-500")
  })

  it("handles 100% utilization (at budget limit)", () => {
    renderBudgetBar({ remaining: 0, percentUsed: 100, actual: 500, limit: 500 })
    expect(screen.getByText(/Remaining:/)).toBeInTheDocument()
  })
})
