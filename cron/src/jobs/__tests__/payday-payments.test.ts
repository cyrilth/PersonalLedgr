/**
 * Tests for the daily payday loan auto-payment job.
 *
 * Focus: a payday balloon payment should charge the source account for
 * principal + fee, record the fee as LOAN_INTEREST, and leave the payday
 * liability account at zero when it is deactivated.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

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

import { prisma } from "../../db"
import { runPaydayPayments } from "../payday-payments"

const mockLoanFindMany = vi.mocked(prisma.loan.findMany)
const txClient = (prisma as unknown as {
  _txClient: {
    transaction: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
    account: { update: ReturnType<typeof vi.fn> }
    interestLog: { create: ReturnType<typeof vi.fn> }
  }
})._txClient

function makePaydayLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: "loan-payday",
    loanType: "PAYDAY",
    originalBalance: 500,
    feePerHundred: 15,
    dueDate: new Date("2026-03-16T00:00:00.000Z"),
    lenderName: "QuickCash",
    paymentAccountId: "acc-checking",
    accountId: "acc-payday",
    nextPaymentDate: new Date("2026-03-16T00:00:00.000Z"),
    account: {
      id: "acc-payday",
      name: "QuickCash Payday",
      userId: "user-1",
      isActive: true,
      balance: -500,
      user: { id: "user-1" },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  txClient.transaction.create
    .mockResolvedValueOnce({ id: "txn-out" })
    .mockResolvedValueOnce({ id: "txn-principal" })
    .mockResolvedValueOnce({ id: "txn-interest" })
  txClient.transaction.update.mockResolvedValue({})
  txClient.account.update.mockResolvedValue({})
  txClient.interestLog.create.mockResolvedValue({})
})

describe("runPaydayPayments", () => {
  it("pays principal plus fee and zeroes the payday liability account", async () => {
    mockLoanFindMany.mockResolvedValue([makePaydayLoan()] as never)

    await runPaydayPayments()

    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: "acc-checking",
          amount: -575,
          type: "TRANSFER",
          source: "SYSTEM",
        }),
      })
    )
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: "acc-payday",
          amount: 500,
          type: "LOAN_PRINCIPAL",
          category: "Loan Payment",
        }),
      })
    )
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: "acc-payday",
          amount: -75,
          type: "LOAN_INTEREST",
          category: "Loan Payment",
        }),
      })
    )
    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-checking" },
      data: { balance: { decrement: 575 } },
    })
    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-payday" },
      data: { balance: { increment: 500 } },
    })
    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-payday" },
      data: { balance: 0, isActive: false },
    })
    expect(txClient.interestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: "acc-payday",
          amount: 75,
          type: "CHARGED",
        }),
      })
    )
    expect(txClient.transaction.create).toHaveBeenCalledTimes(3)
  })

  it("uses borrowed principal for principal payment even if old rows include fee in balance", async () => {
    mockLoanFindMany.mockResolvedValue([
      makePaydayLoan({ account: { ...makePaydayLoan().account, balance: -575 } }),
    ] as never)

    await runPaydayPayments()

    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "LOAN_PRINCIPAL", amount: 500 }),
      })
    )
    expect(txClient.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "LOAN_PRINCIPAL",
          amount: 75,
          category: "Balance Adjustment",
        }),
      })
    )
    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-payday" },
      data: { balance: 0, isActive: false },
    })
  })
})
