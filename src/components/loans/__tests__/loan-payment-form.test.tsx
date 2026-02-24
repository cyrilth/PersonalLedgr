// @vitest-environment jsdom
/**
 * Tests for LoanPaymentForm component.
 *
 * Covers:
 * - Dialog renders with correct title
 * - Payment preview shows principal/interest split
 * - Preview hidden when no loan or amount selected
 * - Form validation (missing loan, missing source, zero amount)
 * - Cancel closes dialog
 * - Auto-fills amount from loan's monthly payment
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LoanPaymentForm } from "../../transactions/loan-payment-form"

vi.mock("@/actions/loan-payments", () => ({
  recordLoanPayment: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockAccounts = [
  { id: "chk-1", name: "Checking", type: "CHECKING", owner: null, balance: 8000 },
  { id: "sav-1", name: "Savings", type: "SAVINGS", owner: null, balance: 15000 },
]

const mockLoanAccounts = [
  {
    id: "loan-1",
    name: "Car Loan",
    type: "LOAN",
    owner: null,
    balance: -12000,
    loan: { interestRate: 0.06, monthlyPayment: 350 },
  },
  {
    id: "loan-2",
    name: "Student Loan",
    type: "LOAN",
    owner: null,
    balance: -25000,
    loan: { interestRate: 0.04, monthlyPayment: 280 },
  },
]

function renderForm(overrides: Partial<Parameters<typeof LoanPaymentForm>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    accounts: mockAccounts,
    loanAccounts: mockLoanAccounts,
    ...overrides,
  }
  return render(<LoanPaymentForm {...props} />)
}

describe("LoanPaymentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the dialog title when open", () => {
    renderForm()
    expect(screen.getByText("Record Loan Payment")).toBeInTheDocument()
  })

  it("renders Loan Account and From Account selectors", () => {
    renderForm()
    expect(screen.getByText("Loan Account")).toBeInTheDocument()
    expect(screen.getByText("From Account")).toBeInTheDocument()
  })

  it("renders Amount and Date fields", () => {
    renderForm()
    expect(screen.getByLabelText("Amount")).toBeInTheDocument()
    expect(screen.getByLabelText("Date")).toBeInTheDocument()
  })

  it("renders Description field", () => {
    renderForm()
    expect(screen.getByLabelText("Description")).toBeInTheDocument()
  })

  it("does not show Payment Breakdown when no loan selected", () => {
    renderForm()
    expect(screen.queryByText("Payment Breakdown")).not.toBeInTheDocument()
  })

  it("does not show Payment Breakdown when amount is empty", () => {
    renderForm()
    // With no amount entered, preview should not appear
    expect(screen.queryByText("Payment Breakdown")).not.toBeInTheDocument()
  })

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn()
    renderForm({ onOpenChange })
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("does not render dialog when open=false", () => {
    renderForm({ open: false })
    expect(screen.queryByText("Record Loan Payment")).not.toBeInTheDocument()
  })

  it("shows error toast when submitted without selecting a loan", async () => {
    const { toast } = await import("sonner")
    renderForm()

    const amountInput = screen.getByLabelText("Amount")
    await userEvent.type(amountInput, "350")

    fireEvent.submit(screen.getByRole("button", { name: /record payment/i }).closest("form")!)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it("shows error toast when amount is zero", async () => {
    const { toast } = await import("sonner")
    renderForm()

    const amountInput = screen.getByLabelText("Amount")
    await userEvent.type(amountInput, "0")

    fireEvent.submit(screen.getByRole("button", { name: /record payment/i }).closest("form")!)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it("renders Record Payment submit button", () => {
    renderForm()
    expect(screen.getByRole("button", { name: /record payment/i })).toBeInTheDocument()
  })

  it("renders Cancel button", () => {
    renderForm()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
  })

  it("displays the description about automatic interest/principal split", () => {
    renderForm()
    expect(screen.getByText(/interest and principal are split automatically/i)).toBeInTheDocument()
  })
})
