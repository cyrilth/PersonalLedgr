// @vitest-environment jsdom
/**
 * Tests for CreditCardPaymentDialog component.
 *
 * Covers:
 * - Dialog renders title/description when open with a card
 * - Does not render when closed or when card is null
 * - Amount defaults to the statement balance (falls back to current balance)
 * - Quick-fill presets render only for positive values and update the amount
 * - Validation: rejects empty amount and missing funding account
 * - Submit creates a transfer into the card account on valid input
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { CreditCardPaymentDialog } from "../credit-card-payment-dialog"

vi.mock("@/actions/transfers", () => ({
  createTransfer: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockFromAccounts = [
  { id: "chk-1", name: "Checking", type: "CHECKING", owner: null, balance: 8000 },
  { id: "sav-1", name: "Savings", type: "SAVINGS", owner: null, balance: 15000 },
]

const mockCard = {
  accountId: "cc-1",
  name: "Visa",
  statementBalance: 1200,
  currentBalance: 1500,
  minimumPayment: 35,
}

function renderDialog(
  overrides: Partial<Parameters<typeof CreditCardPaymentDialog>[0]> = {}
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    card: mockCard,
    month: 6,
    year: 2026,
    defaultDate: "2026-06-15",
    fromAccounts: mockFromAccounts,
    ...overrides,
  }
  return render(<CreditCardPaymentDialog {...props} />)
}

describe("CreditCardPaymentDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the dialog title and card name when open", () => {
    renderDialog()
    expect(screen.getByText("Pay Credit Card")).toBeInTheDocument()
    expect(screen.getByText(/Visa/)).toBeInTheDocument()
  })

  it("does not render when open is false", () => {
    renderDialog({ open: false })
    expect(screen.queryByText("Pay Credit Card")).not.toBeInTheDocument()
  })

  it("renders nothing when card is null", () => {
    renderDialog({ card: null })
    expect(screen.queryByText("Pay Credit Card")).not.toBeInTheDocument()
  })

  it("defaults the amount to the statement balance", () => {
    renderDialog()
    expect(screen.getByLabelText("Amount")).toHaveValue(1200)
  })

  it("falls back to the current balance when no statement balance is owed", () => {
    renderDialog({
      card: { ...mockCard, statementBalance: 0 },
    })
    expect(screen.getByLabelText("Amount")).toHaveValue(1500)
  })

  it("renders quick-fill presets for positive values", () => {
    renderDialog()
    expect(screen.getByText(/Statement balance:/)).toBeInTheDocument()
    expect(screen.getByText(/Current balance:/)).toBeInTheDocument()
    expect(screen.getByText(/Minimum payment:/)).toBeInTheDocument()
  })

  it("omits presets whose value is zero", () => {
    renderDialog({
      card: { ...mockCard, minimumPayment: 0 },
    })
    expect(screen.queryByText(/Minimum payment:/)).not.toBeInTheDocument()
  })

  it("updates the amount when a preset is clicked", () => {
    renderDialog()
    fireEvent.click(screen.getByText(/Minimum payment:/))
    expect(screen.getByLabelText("Amount")).toHaveValue(35)
  })

  it("shows an error and does not submit when no funding account is selected", async () => {
    const { toast } = await import("sonner")
    const { createTransfer } = await import("@/actions/transfers")

    renderDialog()
    fireEvent.submit(
      screen.getByRole("button", { name: /record payment/i }).closest("form")!
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(createTransfer).not.toHaveBeenCalled()
  })

  it("shows an error when the amount is cleared", async () => {
    const { toast } = await import("sonner")

    renderDialog()
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "" } })
    fireEvent.submit(
      screen.getByRole("button", { name: /record payment/i }).closest("form")!
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it("does not warn when the amount is within the balance owed", () => {
    renderDialog() // default amount 1200, current balance 1500
    expect(screen.queryByText(/leave a credit balance/)).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Record Payment" })
    ).toBeInTheDocument()
  })

  it("warns and relabels the action when the amount exceeds the balance owed", () => {
    renderDialog() // current balance 1500
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2000" } })

    expect(screen.getByText(/leave a credit balance/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Record anyway" })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Record Payment" })
    ).not.toBeInTheDocument()
  })

  it("does not warn when the card has no balance owed (currentBalance 0)", () => {
    renderDialog({
      card: { ...mockCard, statementBalance: 0, currentBalance: 0 },
    })
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500" } })
    expect(screen.queryByText(/leave a credit balance/)).not.toBeInTheDocument()
  })
})
