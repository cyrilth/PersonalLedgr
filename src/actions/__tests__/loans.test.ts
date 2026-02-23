/**
 * Unit tests for src/actions/loans.ts — Loan CRUD server actions.
 *
 * Mocking strategy:
 * - next/headers, @/lib/auth, and @/db are vi.mock'd before any imports
 * - Prisma's $transaction is mocked to invoke the callback with a mockTx object,
 *   simulating an interactive transaction without a real database
 * - The _mockTx escape hatch on the prisma mock lets tests assert on calls
 *   made inside the $transaction callback
 */

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

// Mock Prisma client with a nested mockTx for interactive transaction testing.
// _mockTx is exposed so tests can assert on calls made inside $transaction callbacks.
vi.mock("@/db", () => {
  const mockTx = {
    account: {
      create: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
    },
  }
  return {
    prisma: {
      account: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      loan: {
        update: vi.fn(),
      },
      $transaction: vi.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      _mockTx: mockTx,
    },
  }
})

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import {
  getLoans,
  getLoan,
  createLoan,
  updateLoan,
  deleteLoan,
} from "../loans"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockAccountFindMany = vi.mocked(prisma.account.findMany)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)
const mockAccountUpdate = vi.mocked(prisma.account.update)
const mockLoanUpdate = vi.mocked(prisma.loan.update)
const mock$Transaction = vi.mocked(prisma.$transaction)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockTx = (prisma as any)._mockTx

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal session object for the auth mock. */
function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

/** Simulates a Prisma Decimal value with toNumber/valueOf/toString methods. */
function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

/**
 * Factory for a mock Account + Loan record as Prisma would return.
 * Defaults to a MORTGAGE with -250k balance; override any field via the spread.
 */
function makeLoanAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-loan-1",
    name: "Home Mortgage",
    type: "MORTGAGE",
    balance: decimal(-250000),
    owner: null,
    isActive: true,
    userId: "user-1",
    loan: {
      id: "loan-1",
      loanType: "MORTGAGE",
      originalBalance: decimal(300000),
      interestRate: decimal(6.5),
      termMonths: 360,
      startDate: new Date("2024-01-01"),
      monthlyPayment: decimal(1896.2),
      extraPaymentAmount: decimal(0),
      accountId: "acc-loan-1",
    },
    transactions: [],
    interestLogs: [],
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── getLoans ──────────────────────────────────────────────────────────────────

describe("getLoans", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getLoans()).rejects.toThrow("Unauthorized")
  })

  it("returns all active loans with account data", async () => {
    mockAccountFindMany.mockResolvedValue([makeLoanAccount()] as never)

    const loans = await getLoans()

    expect(loans).toHaveLength(1)
    expect(loans[0]).toMatchObject({
      id: "loan-1",
      accountId: "acc-loan-1",
      accountName: "Home Mortgage",
      loanType: "MORTGAGE",
      balance: -250000,
      originalBalance: 300000,
      interestRate: 6.5,
      termMonths: 360,
      monthlyPayment: 1896.2,
    })
  })

  it("filters to only LOAN and MORTGAGE accounts", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)
    await getLoans()

    expect(mockAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ["LOAN", "MORTGAGE"] },
          isActive: true,
        }),
      })
    )
  })

  it("returns empty array when no loans exist", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)
    const loans = await getLoans()
    expect(loans).toEqual([])
  })

  it("returns multiple loans sorted by name", async () => {
    mockAccountFindMany.mockResolvedValue([
      makeLoanAccount(),
      makeLoanAccount({
        id: "acc-loan-2",
        name: "Car Loan",
        type: "LOAN",
        balance: decimal(-15000),
        loan: {
          id: "loan-2",
          loanType: "AUTO",
          originalBalance: decimal(25000),
          interestRate: decimal(4.5),
          termMonths: 60,
          startDate: new Date("2023-06-01"),
          monthlyPayment: decimal(466.08),
          extraPaymentAmount: decimal(50),
          accountId: "acc-loan-2",
        },
      }),
    ] as never)

    const loans = await getLoans()
    expect(loans).toHaveLength(2)
    expect(loans[1].loanType).toBe("AUTO")
  })
})

// ── getLoan ────────────────────────────────────────────────────────────────────

describe("getLoan", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getLoan("loan-1")).rejects.toThrow("Unauthorized")
  })

  it("throws when loan not found", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(getLoan("nonexistent")).rejects.toThrow("Loan not found")
  })

  it("returns full loan detail with transactions and interest logs", async () => {
    const account = makeLoanAccount({
      transactions: [
        {
          id: "txn-1",
          date: new Date("2024-02-01"),
          description: "Monthly Payment",
          amount: decimal(-1896.2),
          type: "LOAN_PRINCIPAL",
          category: "Loan Payment",
        },
      ],
      interestLogs: [
        {
          id: "il-1",
          date: new Date("2024-02-01"),
          amount: decimal(1354.17),
          type: "LOAN_INTEREST",
          notes: "Monthly interest",
        },
      ],
    })

    mockAccountFindFirst.mockResolvedValue(account as never)

    const loan = await getLoan("loan-1")

    expect(loan.id).toBe("loan-1")
    expect(loan.accountId).toBe("acc-loan-1")
    expect(loan.transactions).toHaveLength(1)
    expect(loan.transactions[0].amount).toBe(-1896.2)
    expect(loan.interestLogs).toHaveLength(1)
    expect(loan.interestLogs[0].amount).toBe(1354.17)
  })

  it("queries by loan id and userId", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)
    await getLoan("loan-1")

    expect(mockAccountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          loan: { id: "loan-1" },
        }),
      })
    )
  })
})

// ── createLoan ────────────────────────────────────────────────────────────────

describe("createLoan", () => {
  const validData = {
    name: "New Mortgage",
    type: "MORTGAGE" as const,
    balance: -280000,
    loanType: "MORTGAGE" as const,
    originalBalance: 280000,
    interestRate: 7.0,
    termMonths: 360,
    startDate: "2024-06-01",
    monthlyPayment: 1863.09,
  }

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(createLoan(validData)).rejects.toThrow("Unauthorized")
  })

  it("validates required fields", async () => {
    await expect(createLoan({ ...validData, name: "" })).rejects.toThrow("Loan name is required")
    await expect(createLoan({ ...validData, name: "  " })).rejects.toThrow("Loan name is required")
    await expect(createLoan({ ...validData, interestRate: -1 })).rejects.toThrow("Interest rate must be non-negative")
    await expect(createLoan({ ...validData, termMonths: 0 })).rejects.toThrow("Term must be positive")
    await expect(createLoan({ ...validData, monthlyPayment: 0 })).rejects.toThrow("Monthly payment must be positive")
  })

  it("creates account + loan + opening balance transaction atomically", async () => {
    mockTx.account.create.mockResolvedValue({
      id: "acc-new",
      loan: { id: "loan-new" },
    } as never)

    const result = await createLoan(validData)

    expect(result).toEqual({ id: "loan-new", accountId: "acc-new" })
    expect(mock$Transaction).toHaveBeenCalled()
    expect(mockTx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "New Mortgage",
          type: "MORTGAGE",
          balance: -280000,
          userId: "user-1",
          loan: {
            create: expect.objectContaining({
              loanType: "MORTGAGE",
              originalBalance: 280000,
              interestRate: 7.0,
              termMonths: 360,
              monthlyPayment: 1863.09,
            }),
          },
        }),
      })
    )
    expect(mockTx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          description: "Opening Balance",
          amount: -280000,
          type: "EXPENSE",
          source: "SYSTEM",
        }),
      })
    )
  })

  it("skips opening balance transaction when balance is 0", async () => {
    mockTx.account.create.mockResolvedValue({
      id: "acc-new",
      loan: { id: "loan-new" },
    } as never)

    await createLoan({ ...validData, balance: 0 })

    expect(mockTx.transaction.create).not.toHaveBeenCalled()
  })

  it("defaults extraPaymentAmount to 0", async () => {
    mockTx.account.create.mockResolvedValue({
      id: "acc-new",
      loan: { id: "loan-new" },
    } as never)

    await createLoan(validData)

    expect(mockTx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loan: {
            create: expect.objectContaining({
              extraPaymentAmount: 0,
            }),
          },
        }),
      })
    )
  })

  it("trims loan name", async () => {
    mockTx.account.create.mockResolvedValue({
      id: "acc-new",
      loan: { id: "loan-new" },
    } as never)

    await createLoan({ ...validData, name: "  My Loan  " })

    expect(mockTx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "My Loan",
        }),
      })
    )
  })
})

// ── updateLoan ────────────────────────────────────────────────────────────────

describe("updateLoan", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(updateLoan("loan-1", { name: "Updated" })).rejects.toThrow("Unauthorized")
  })

  it("throws when loan not found", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(updateLoan("nonexistent", { name: "Updated" })).rejects.toThrow("Loan not found")
  })

  it("updates account-level fields (name, owner)", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)

    await updateLoan("loan-1", { name: "Renamed Mortgage", owner: "John" })

    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-loan-1" },
      data: { name: "Renamed Mortgage", owner: "John" },
    })
  })

  it("updates loan-specific fields", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)

    await updateLoan("loan-1", { interestRate: 5.5, monthlyPayment: 1700 })

    expect(mockLoanUpdate).toHaveBeenCalledWith({
      where: { id: "loan-1" },
      data: { interestRate: 5.5, monthlyPayment: 1700 },
    })
  })

  it("updates both account and loan fields in one call", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)

    await updateLoan("loan-1", {
      name: "Updated",
      interestRate: 5.0,
      extraPaymentAmount: 200,
    })

    expect(mockAccountUpdate).toHaveBeenCalled()
    expect(mockLoanUpdate).toHaveBeenCalled()
  })

  it("skips account update when no account fields provided", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)

    await updateLoan("loan-1", { interestRate: 5.5 })

    expect(mockAccountUpdate).not.toHaveBeenCalled()
    expect(mockLoanUpdate).toHaveBeenCalled()
  })

  it("skips loan update when no loan fields provided", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)

    await updateLoan("loan-1", { name: "Renamed" })

    expect(mockAccountUpdate).toHaveBeenCalled()
    expect(mockLoanUpdate).not.toHaveBeenCalled()
  })

  it("returns success on update", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)
    const result = await updateLoan("loan-1", { name: "Updated" })
    expect(result).toEqual({ success: true })
  })
})

// ── deleteLoan ────────────────────────────────────────────────────────────────

describe("deleteLoan", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(deleteLoan("loan-1")).rejects.toThrow("Unauthorized")
  })

  it("throws when loan not found", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(deleteLoan("nonexistent")).rejects.toThrow("Loan not found")
  })

  it("soft-deletes by setting isActive to false on the parent account", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)

    const result = await deleteLoan("loan-1")

    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-loan-1" },
      data: { isActive: false },
    })
    expect(result).toEqual({ success: true })
  })

  it("scopes query by userId", async () => {
    mockAccountFindFirst.mockResolvedValue(makeLoanAccount() as never)
    await deleteLoan("loan-1")

    expect(mockAccountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          loan: { id: "loan-1" },
        }),
      })
    )
  })
})
