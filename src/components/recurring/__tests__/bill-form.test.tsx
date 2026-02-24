// @vitest-environment jsdom
/**
 * Tests for BillForm component.
 *
 * Covers:
 * - Renders "Add Recurring Bill" in create mode
 * - Renders "Edit Recurring Bill" in edit mode
 * - All form fields are present
 * - Variable amount toggle changes label from "Amount" to "Estimated Amount"
 * - Pre-fills fields in edit mode
 * - Validation: name required, amount must be positive, day 1-31, account required
 * - Cancel calls onOpenChange(false)
 * - Submit button text changes based on edit/create mode
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BillForm } from "../bill-form"

vi.mock("@/actions/recurring", () => ({
  createRecurringBill: vi.fn().mockResolvedValue(undefined),
  updateRecurringBill: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockAccounts = [
  { id: "chk-1", name: "Checking" },
  { id: "sav-1", name: "Savings" },
]

const mockCategories = ["Utilities", "Insurance", "Subscriptions"]

function renderForm(overrides: Partial<Parameters<typeof BillForm>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    editData: null,
    accounts: mockAccounts,
    categories: mockCategories,
    ...overrides,
  }
  return render(<BillForm {...props} />)
}

const sampleEditData = {
  id: "bill-1",
  name: "Electric Bill",
  amount: 120,
  frequency: "MONTHLY" as const,
  dayOfMonth: 15,
  isVariableAmount: false,
  category: "Utilities",
  accountId: "chk-1",
}

describe("BillForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders 'Add Recurring Bill' title in create mode", () => {
    renderForm()
    expect(screen.getByText("Add Recurring Bill")).toBeInTheDocument()
  })

  it("renders 'Edit Recurring Bill' title in edit mode", () => {
    renderForm({ editData: sampleEditData })
    expect(screen.getByText("Edit Recurring Bill")).toBeInTheDocument()
  })

  it("renders Name, Amount, Frequency, Day of Month fields", () => {
    renderForm()
    expect(screen.getByLabelText("Name")).toBeInTheDocument()
    expect(screen.getByLabelText("Amount")).toBeInTheDocument()
    expect(screen.getByText("Frequency")).toBeInTheDocument()
    expect(screen.getByLabelText("Day of Month")).toBeInTheDocument()
  })

  it("renders the variable amount toggle", () => {
    renderForm()
    expect(screen.getByLabelText("Variable amount")).toBeInTheDocument()
  })

  it("renders Category and Payment Account fields", () => {
    renderForm()
    expect(screen.getByText("Category (optional)")).toBeInTheDocument()
    expect(screen.getByText("Payment Account")).toBeInTheDocument()
  })

  it("shows 'Amount' label when isVariableAmount is false", () => {
    renderForm()
    expect(screen.getByLabelText("Amount")).toBeInTheDocument()
    expect(screen.queryByLabelText("Estimated Amount")).not.toBeInTheDocument()
  })

  it("changes amount label to 'Estimated Amount' when variable toggle is on", async () => {
    renderForm()
    const toggle = screen.getByRole("switch")
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(screen.getByLabelText("Estimated Amount")).toBeInTheDocument()
    })
  })

  it("pre-fills name field in edit mode", () => {
    renderForm({ editData: sampleEditData })
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement
    expect(nameInput.value).toBe("Electric Bill")
  })

  it("pre-fills amount field in edit mode", () => {
    renderForm({ editData: sampleEditData })
    const amountInput = screen.getByLabelText("Amount") as HTMLInputElement
    expect(amountInput.value).toBe("120")
  })

  it("pre-fills day of month field in edit mode", () => {
    renderForm({ editData: sampleEditData })
    const dayInput = screen.getByLabelText("Day of Month") as HTMLInputElement
    expect(dayInput.value).toBe("15")
  })

  it("pre-fills variable toggle state in edit mode", () => {
    renderForm({ editData: { ...sampleEditData, isVariableAmount: true } })
    // Label should have changed to "Estimated Amount" when pre-filled as variable
    expect(screen.getByLabelText("Estimated Amount")).toBeInTheDocument()
  })

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn()
    renderForm({ onOpenChange })
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows 'Create Bill' button in create mode", () => {
    renderForm()
    expect(screen.getByRole("button", { name: /create bill/i })).toBeInTheDocument()
  })

  it("shows 'Save Changes' button in edit mode", () => {
    renderForm({ editData: sampleEditData })
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument()
  })

  it("shows toast error when name is empty on submit", async () => {
    const { toast } = await import("sonner")
    renderForm()

    // Leave name empty, fill required fields
    const amountInput = screen.getByLabelText("Amount")
    await userEvent.type(amountInput, "50")

    const dayInput = screen.getByLabelText("Day of Month")
    await userEvent.type(dayInput, "15")

    fireEvent.submit(screen.getByRole("button", { name: /create bill/i }).closest("form")!)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it("shows toast error when day of month is out of range", async () => {
    const { toast } = await import("sonner")
    renderForm()

    const nameInput = screen.getByLabelText("Name")
    await userEvent.type(nameInput, "Netflix")

    const amountInput = screen.getByLabelText("Amount")
    await userEvent.type(amountInput, "15.99")

    const dayInput = screen.getByLabelText("Day of Month")
    await userEvent.type(dayInput, "32")

    fireEvent.submit(screen.getByRole("button", { name: /create bill/i }).closest("form")!)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it("does not render when open=false", () => {
    renderForm({ open: false })
    expect(screen.queryByText("Add Recurring Bill")).not.toBeInTheDocument()
  })

  it("renders description text for variable amount toggle", () => {
    renderForm()
    expect(screen.getByText("Bill amount varies each period")).toBeInTheDocument()
  })
})
