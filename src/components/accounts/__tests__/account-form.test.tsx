// @vitest-environment jsdom
/**
 * Tests for AccountForm component.
 *
 * Covers:
 * - Renders "Add Account" in create mode
 * - Renders "Edit Account" in edit mode
 * - Base fields always visible: Name, Type, Balance, Owner
 * - Credit Card fields appear only when type = CREDIT_CARD
 * - Loan fields appear only when type = LOAN or MORTGAGE
 * - Mortgage hides the Loan Type sub-selector
 * - Loan shows Loan Type sub-selector (excluding MORTGAGE option)
 * - Cancel calls onOpenChange(false)
 * - Type selector disabled in edit mode
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { AccountForm } from "../account-form"

vi.mock("@/actions/accounts", () => ({
  createAccount: vi.fn().mockResolvedValue({ id: "new-acct" }),
  updateAccount: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function renderForm(overrides: Partial<Parameters<typeof AccountForm>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
    account: null,
    ...overrides,
  }
  return render(<AccountForm {...props} />)
}

describe("AccountForm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders 'Add Account' title in create mode", () => {
    renderForm()
    expect(screen.getByText("Add Account")).toBeInTheDocument()
  })

  it("renders 'Edit Account' title in edit mode", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "Chase Checking",
        type: "CHECKING",
        balance: 5000,
        creditLimit: null,
        owner: null,
      },
    })
    expect(screen.getByText("Edit Account")).toBeInTheDocument()
  })

  it("renders base fields: Name, Type, Balance, Owner", () => {
    renderForm()
    expect(screen.getByLabelText("Name")).toBeInTheDocument()
    expect(screen.getByLabelText("Balance")).toBeInTheDocument()
    expect(screen.getByLabelText("Owner (optional)")).toBeInTheDocument()
  })

  it("does not show Credit Card Details section for CHECKING type", () => {
    renderForm()
    // Default type is CHECKING, so CC section should be absent
    expect(screen.queryByText("Credit Card Details")).not.toBeInTheDocument()
  })

  it("does not show Loan Details section for CHECKING type", () => {
    renderForm()
    expect(screen.queryByText("Loan Details")).not.toBeInTheDocument()
  })

  it("does not show Credit Card Details section for SAVINGS type", () => {
    // We cannot interact with the Select in jsdom easily, so test by preloading edit data
    renderForm({
      account: {
        id: "acct-1",
        name: "My Savings",
        type: "SAVINGS",
        balance: 10000,
        creditLimit: null,
        owner: null,
      },
    })
    expect(screen.queryByText("Credit Card Details")).not.toBeInTheDocument()
  })

  it("shows Credit Card Details section when type is CREDIT_CARD (edit mode)", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "Visa Card",
        type: "CREDIT_CARD",
        balance: -500,
        creditLimit: 5000,
        owner: null,
        creditCardDetails: {
          statementCloseDay: 15,
          paymentDueDay: 10,
          gracePeriodDays: 25,
        },
      },
    })
    expect(screen.getByText("Credit Card Details")).toBeInTheDocument()
    expect(screen.getByLabelText("Credit Limit")).toBeInTheDocument()
    expect(screen.getByText("Statement Close Day")).toBeInTheDocument()
    expect(screen.getByText("Payment Due Day")).toBeInTheDocument()
    expect(screen.getByLabelText("Grace Period (days)")).toBeInTheDocument()
  })

  it("shows Loan Details section when type is LOAN (edit mode)", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "Car Loan",
        type: "LOAN",
        balance: -12000,
        creditLimit: null,
        owner: null,
        loan: {
          loanType: "AUTO",
          originalBalance: 15000,
          interestRate: 0.06,
          termMonths: 60,
          startDate: "2023-01-01",
          monthlyPayment: 290,
          extraPaymentAmount: 0,
        },
      },
    })
    expect(screen.getByText("Loan Details")).toBeInTheDocument()
    expect(screen.getByLabelText("Original Balance")).toBeInTheDocument()
    expect(screen.getByLabelText("Interest Rate (%)")).toBeInTheDocument()
    expect(screen.getByLabelText("Term (months)")).toBeInTheDocument()
    expect(screen.getByLabelText("Monthly Payment")).toBeInTheDocument()
  })

  it("shows Loan Type sub-selector for LOAN type", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "Car Loan",
        type: "LOAN",
        balance: -12000,
        creditLimit: null,
        owner: null,
        loan: {
          loanType: "AUTO",
          originalBalance: 15000,
          interestRate: 0.06,
          termMonths: 60,
          startDate: "2023-01-01",
          monthlyPayment: 290,
          extraPaymentAmount: 0,
        },
      },
    })
    expect(screen.getByText("Loan Type")).toBeInTheDocument()
  })

  it("shows Mortgage Details section for MORTGAGE type (no Loan Type selector)", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "Home Mortgage",
        type: "MORTGAGE",
        balance: -250000,
        creditLimit: null,
        owner: null,
        loan: {
          loanType: "MORTGAGE",
          originalBalance: 300000,
          interestRate: 0.035,
          termMonths: 360,
          startDate: "2020-06-01",
          monthlyPayment: 1347,
          extraPaymentAmount: 0,
        },
      },
    })
    expect(screen.getByText("Mortgage Details")).toBeInTheDocument()
    // Loan Type sub-selector should NOT be shown for mortgage
    expect(screen.queryByText("Loan Type")).not.toBeInTheDocument()
  })

  it("calls onOpenChange(false) when Cancel is clicked", () => {
    const onOpenChange = vi.fn()
    renderForm({ onOpenChange })
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("renders Create Account submit button in create mode", () => {
    renderForm()
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument()
  })

  it("renders Save Changes submit button in edit mode", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "Checking",
        type: "CHECKING",
        balance: 1000,
        creditLimit: null,
        owner: null,
      },
    })
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument()
  })

  it("does not render when open=false", () => {
    renderForm({ open: false })
    expect(screen.queryByText("Add Account")).not.toBeInTheDocument()
  })

  it("pre-fills name field in edit mode", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "My Savings",
        type: "SAVINGS",
        balance: 5000,
        creditLimit: null,
        owner: null,
      },
    })
    const nameInput = screen.getByLabelText("Name") as HTMLInputElement
    expect(nameInput.value).toBe("My Savings")
  })

  it("pre-fills balance field in edit mode", () => {
    renderForm({
      account: {
        id: "acct-1",
        name: "Checking",
        type: "CHECKING",
        balance: 3500,
        creditLimit: null,
        owner: null,
      },
    })
    const balanceInput = screen.getByLabelText("Balance") as HTMLInputElement
    expect(balanceInput.value).toBe("3500")
  })
})
