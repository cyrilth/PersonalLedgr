import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Module mocks (hoisted before imports) ────────────────────────────────────

vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Map()),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock("@/db", () => {
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
      account: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import { recordLoanPayment } from "../loan-payments"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txClient = (prisma as any)._txClient as {
  transaction: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  account: { update: ReturnType<typeof vi.fn> }
  interestLog: { create: ReturnType<typeof vi.fn> }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

const validInput = {
  loanAccountId: "loan-1",
  fromAccountId: "acc-1",
  amount: 1000,
  date: "2026-02-15",
  description: "Mortgage Payment",
}

// Loan: $200,000 balance, 6% rate → monthly interest = 200000 * 0.06 / 12 = $1,000
const mockLoanAccount = {
  id: "loan-1",
  userId: "user-1",
  balance: decimal(-200000),
  loan: {
    id: "loan-record-1",
    interestRate: decimal(0.06),
    monthlyPayment: decimal(1199.10),
  },
}

const mockFromAccount = {
  id: "acc-1",
  userId: "user-1",
  balance: decimal(50000),
}

// Mock transaction return values
const mockOutgoing = {
  id: "txn-out",
  amount: decimal(-1199.10),
  type: "TRANSFER",
  source: "MANUAL",
  accountId: "acc-1",
}

const mockPrincipal = {
  id: "txn-principal",
  amount: decimal(199.10),
  type: "LOAN_PRINCIPAL",
  source: "SYSTEM",
  accountId: "loan-1",
}

const mockInterest = {
  id: "txn-interest",
  amount: decimal(-1000),
  type: "LOAN_INTEREST",
  source: "SYSTEM",
  accountId: "loan-1",
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)

  // Default: accounts exist and belong to user
  mockAccountFindFirst.mockImplementation(((args: { where: { id: string } }) => {
    if (args.where.id === "acc-1") return Promise.resolve(mockFromAccount)
    if (args.where.id === "loan-1") return Promise.resolve(mockLoanAccount)
    return Promise.resolve(null)
  }) as never)

  // Default tx client return values
  let callCount = 0
  txClient.transaction.create.mockImplementation(() => {
    callCount++
    if (callCount === 1) return mockOutgoing
    if (callCount === 2) return mockPrincipal
    return mockInterest
  })
  txClient.transaction.update.mockResolvedValue({} as never)
  txClient.account.update.mockResolvedValue({} as never)
  txClient.interestLog.create.mockResolvedValue({} as never)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("recordLoanPayment", () => {
  // ── Validation ──────────────────────────────────────────────────────

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(recordLoanPayment(validInput)).rejects.toThrow("Unauthorized")
  })

  it("throws when amount is zero", async () => {
    await expect(recordLoanPayment({ ...validInput, amount: 0 })).rejects.toThrow(
      "Payment amount must be greater than zero"
    )
  })

  it("throws when amount is negative", async () => {
    await expect(recordLoanPayment({ ...validInput, amount: -100 })).rejects.toThrow(
      "Payment amount must be greater than zero"
    )
  })

  it("throws when source and loan accounts are the same", async () => {
    await expect(
      recordLoanPayment({ ...validInput, fromAccountId: "loan-1", loanAccountId: "loan-1" })
    ).rejects.toThrow("Source and loan accounts must be different")
  })

  it("throws when source account not found", async () => {
    mockAccountFindFirst.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "acc-1") return Promise.resolve(null)
      return Promise.resolve(mockLoanAccount)
    }) as never)

    await expect(recordLoanPayment(validInput)).rejects.toThrow("Source account not found")
  })

  it("throws when loan account not found", async () => {
    mockAccountFindFirst.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "acc-1") return Promise.resolve(mockFromAccount)
      return Promise.resolve(null)
    }) as never)

    await expect(recordLoanPayment(validInput)).rejects.toThrow("Loan account not found")
  })

  it("throws when account has no loan record", async () => {
    mockAccountFindFirst.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "acc-1") return Promise.resolve(mockFromAccount)
      if (args.where.id === "loan-1") return Promise.resolve({ ...mockLoanAccount, loan: null })
      return Promise.resolve(null)
    }) as never)

    await expect(recordLoanPayment(validInput)).rejects.toThrow("Account does not have a loan record")
  })

  it("same-account check runs before account lookup", async () => {
    await expect(
      recordLoanPayment({ ...validInput, fromAccountId: "loan-1", loanAccountId: "loan-1" })
    ).rejects.toThrow("Source and loan accounts must be different")
    expect(mockAccountFindFirst).not.toHaveBeenCalled()
  })

  // ── Interest/Principal Split ────────────────────────────────────────

  it("calculates correct principal/interest split", async () => {
    // $200k balance at 6% → monthly interest = $1,000
    // Payment of $1,199.10 → principal = $199.10, interest = $1,000
    const result = await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(result.interestAmount).toBe(1000)
    expect(result.principalAmount).toBe(199.10)
  })

  it("when payment < interest, all goes to interest", async () => {
    // Monthly interest is $1,000 but paying only $500
    const result = await recordLoanPayment({ ...validInput, amount: 500 })

    expect(result.interestAmount).toBe(500)
    expect(result.principalAmount).toBe(0)
  })

  it("when payment equals interest exactly, principal is zero", async () => {
    const result = await recordLoanPayment({ ...validInput, amount: 1000 })

    expect(result.interestAmount).toBe(1000)
    expect(result.principalAmount).toBe(0)
  })

  // ── Transaction Creation ────────────────────────────────────────────

  it("creates TRANSFER on source account with negative full amount", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -1199.10,
        type: "TRANSFER",
        source: "MANUAL",
        accountId: "acc-1",
        userId: "user-1",
      }),
    })
  })

  it("creates LOAN_PRINCIPAL on loan account with positive principal amount", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 199.10,
        type: "LOAN_PRINCIPAL",
        source: "SYSTEM",
        category: "Loan Payment",
        accountId: "loan-1",
        userId: "user-1",
      }),
    })
  })

  it("creates LOAN_INTEREST on loan account with negative interest amount", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -1000,
        type: "LOAN_INTEREST",
        source: "SYSTEM",
        category: "Loan Payment",
        accountId: "loan-1",
        userId: "user-1",
      }),
    })
  })

  it("links outgoing transaction to principal transaction", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(txClient.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-out" },
      data: { linkedTransactionId: "txn-principal" },
    })
  })

  // ── Balance Updates ─────────────────────────────────────────────────

  it("decrements source account balance by full payment amount", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { decrement: 1199.10 } },
    })
  })

  it("increments loan account balance by principal amount", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "loan-1" },
      data: { balance: { increment: 199.10 } },
    })
  })

  // ── Interest Log ────────────────────────────────────────────────────

  it("creates InterestLog entry with CHARGED type", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(txClient.interestLog.create).toHaveBeenCalledWith({
      data: {
        date: new Date("2026-02-15"),
        amount: 1000,
        type: "CHARGED",
        userId: "user-1",
        accountId: "loan-1",
      },
    })
  })

  // ── Atomicity ───────────────────────────────────────────────────────

  it("executes all operations inside a $transaction block", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })
    expect(vi.mocked(prisma.$transaction)).toHaveBeenCalledOnce()
  })

  it("creates exactly three transactions", async () => {
    await recordLoanPayment({ ...validInput, amount: 1199.10 })
    expect(txClient.transaction.create).toHaveBeenCalledTimes(3)
  })

  // ── Return Value ────────────────────────────────────────────────────

  it("returns all three transaction IDs and computed split amounts", async () => {
    const result = await recordLoanPayment({ ...validInput, amount: 1199.10 })

    expect(result).toEqual({
      outgoingId: "txn-out",
      principalId: "txn-principal",
      interestId: "txn-interest",
      principalAmount: 199.10,
      interestAmount: 1000,
      totalAmount: -1199.10,
    })
  })

  it("uses provided description", async () => {
    await recordLoanPayment({ ...validInput, description: "Custom payment" })

    const calls = txClient.transaction.create.mock.calls
    expect(calls[0][0].data.description).toBe("Custom payment")
    expect(calls[1][0].data.description).toBe("Custom payment")
    expect(calls[2][0].data.description).toBe("Custom payment")
  })

  it("uses default description when none provided", async () => {
    await recordLoanPayment({ ...validInput, description: undefined })

    const calls = txClient.transaction.create.mock.calls
    expect(calls[0][0].data.description).toBe("Loan Payment")
  })
})
