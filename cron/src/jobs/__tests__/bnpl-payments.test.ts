/**
 * Tests for the daily BNPL auto-payment job.
 *
 * Focus: the interest-split math for BNPL loans that carry interest.
 * `interestRate` is stored as a percentage (e.g. 12 = 12%), so the monthly
 * interest must be |balance| × (rate / 100) / 12 — NOT |balance| × rate / 12,
 * which would treat 12% as 1200% (a 100x overstatement).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock ../db (relative to the job file, so ../../db from __tests__) ────────

vi.mock("../../db", () => {
  const txClient = {
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
    interestLog: {
      create: vi.fn(),
    },
    loan: {
      update: vi.fn(),
    },
  }
  return {
    prisma: {
      loan: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports after mocks ───────────────────────────────────────────────────────

import { prisma } from "../../db"
import { runBnplPayments } from "../bnpl-payments"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockLoanFindMany = vi.mocked(prisma.loan.findMany)
const txClient = (prisma as unknown as {
  _txClient: {
    transaction: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    account: { update: ReturnType<typeof vi.fn> }
    interestLog: { create: ReturnType<typeof vi.fn> }
    loan: { update: ReturnType<typeof vi.fn> }
  }
})._txClient

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a BNPL loan row as Prisma would return it (with included account). */
function makeBnplLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: "loan-1",
    loanType: "BNPL",
    interestRate: 12, // percentage (12 = 12%)
    originalBalance: 1200,
    totalInstallments: 4,
    completedInstallments: 0,
    monthlyPayment: 300,
    installmentFrequency: "MONTHLY",
    merchantName: "PayPal - Nike",
    paymentAccountId: "acc-pay",
    accountId: "acc-loan",
    nextPaymentDate: new Date("2026-02-15T00:00:00.000Z"),
    account: {
      id: "acc-loan",
      name: "BNPL - Nike",
      userId: "user-1",
      isActive: true,
      balance: -1200,
      user: { id: "user-1" },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  txClient.transaction.create.mockResolvedValue({ id: "txn-x" })
  txClient.transaction.update.mockResolvedValue({})
  txClient.account.update.mockResolvedValue({})
  txClient.interestLog.create.mockResolvedValue({})
  txClient.loan.update.mockResolvedValue({})
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("runBnplPayments — interest split", () => {
  it("treats interestRate as a percentage (12% on $1,200 → $12/mo, not $1,200)", async () => {
    // installmentAmount = 1200 / 4 = 300; monthlyInterest = 1200 × (12/100) / 12 = 12
    mockLoanFindMany.mockResolvedValue([makeBnplLoan()] as never)

    await runBnplPayments()

    // The interest log records the charged interest amount
    expect(txClient.interestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 12, type: "CHARGED" }),
      })
    )

    // The LOAN_INTEREST transaction carries -interest (negative)
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "LOAN_INTEREST", amount: -12 }),
      })
    )

    // Principal = installment (300) − interest (12) = 288
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "LOAN_PRINCIPAL", amount: 288 }),
      })
    )
  })

  it("0% interest BNPL is a pure transfer with no interest log", async () => {
    mockLoanFindMany.mockResolvedValue([
      makeBnplLoan({ interestRate: 0, account: { ...makeBnplLoan().account } }),
    ] as never)

    await runBnplPayments()

    expect(txClient.interestLog.create).not.toHaveBeenCalled()
    // Full installment ($300) moves as principal
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "LOAN_PRINCIPAL", amount: 300 }),
      })
    )
  })
})
