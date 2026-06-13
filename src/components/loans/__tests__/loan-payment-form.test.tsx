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

// interestRate is stored as a PERCENTAGE (6 = 6%), matching getAccountsFlat
// and the server split — not a decimal fraction.
const mockLoanAccounts = [
  {
    id: "loan-1",
    name: "Car Loan",
    type: "LOAN",
    owner: null,
    balance: -12000,
    loan: { interestRate: 6, monthlyPayment: 350 },
  },
  {
    id: "loan-2",
    name: "Student Loan",
    type: "LOAN",
    owner: null,
    balance: -25000,
    loan: { interestRate: 4, monthlyPayment: 280 },
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

  it("pre-selects the loan and pre-fills date/amount when defaults are provided", async () => {
    // Simulates opening from the Payment Tracker grid for a specific loan + month.
    renderForm({ defaultLoanAccountId: "loan-1", defaultDate: "2026-03-15" })

    // Date is anchored to the clicked month, not today.
    expect(screen.getByLabelText("Date")).toHaveValue("2026-03-15")

    // Amount auto-fills from the pre-selected loan's monthly payment ($350),
    // which in turn makes the principal/interest preview appear.
    await waitFor(() => {
      expect(screen.getByLabelText("Amount")).toHaveValue(350)
    })
    expect(screen.getByText("Payment Breakdown")).toBeInTheDocument()
  })

  it("defaults date to today and no loan when no defaults are provided", () => {
    renderForm()
    const today = new Date().toISOString().split("T")[0]
    expect(screen.getByLabelText("Date")).toHaveValue(today)
    expect(screen.queryByText("Payment Breakdown")).not.toBeInTheDocument()
  })

  it("computes the preview split treating interestRate as a percentage (÷100)", async () => {
    // loan-1: balance $12,000 at 6%/yr → monthly interest = 12000*6/100/12 = $60,
    // principal = 350 - 60 = $290. If the ÷100 is dropped, interest would be
    // $6,000 (> payment) and the split would collapse to interest=$350/principal=$0.
    renderForm({ defaultLoanAccountId: "loan-1", defaultDate: "2026-03-15" })
    await waitFor(() => expect(screen.getByText("Payment Breakdown")).toBeInTheDocument())
    expect(screen.getByText("$60.00")).toBeInTheDocument()
    expect(screen.getByText("$290.00")).toBeInTheDocument()
  })

  it("re-fills the amount when reopening the same pre-selected loan", async () => {
    // Reproduces the grid flow: open for loan-1, close, then click the same
    // cell again. The loan id never changes, so the selectedLoan pre-fill effect
    // won't re-run — the reset effect must restore the amount itself.
    const baseProps = {
      onOpenChange: vi.fn(),
      onSuccess: vi.fn(),
      accounts: mockAccounts,
      loanAccounts: mockLoanAccounts,
      defaultLoanAccountId: "loan-1",
      defaultDate: "2026-03-15",
    }
    const { rerender } = render(<LoanPaymentForm open={true} {...baseProps} />)
    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveValue(350))

    // Close, then reopen for the same loan/month.
    rerender(<LoanPaymentForm open={false} {...baseProps} />)
    rerender(<LoanPaymentForm open={true} {...baseProps} />)

    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveValue(350))
  })
})
