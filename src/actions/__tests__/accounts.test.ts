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
  const mockTx = {
    transaction: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    account: {
      delete: vi.fn(),
    },
  }
  return {
    prisma: {
      account: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      transaction: {
        findMany: vi.fn(),
        create: vi.fn(),
        aggregate: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
      },
      creditCardDetails: {
        upsert: vi.fn(),
      },
      loan: {
        upsert: vi.fn(),
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
  getAccounts,
  getInactiveAccounts,
  getAccount,
  createAccount,
  updateAccount,
  deleteAccount,
  reactivateAccount,
  recalculateBalance,
  confirmRecalculate,
  recalculateAllBalances,
  confirmRecalculateAll,
  getBalanceHistory,
  getAccountTransactions,
  permanentlyDeleteAccount,
} from "../accounts"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockAccountFindMany = vi.mocked(prisma.account.findMany)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)
const mockAccountCreate = vi.mocked(prisma.account.create)
const mockAccountUpdate = vi.mocked(prisma.account.update)
const mockTransactionFindMany = vi.mocked(prisma.transaction.findMany)
const mockTransactionCreate = vi.mocked(prisma.transaction.create)
const mockTransactionAggregate = vi.mocked(prisma.transaction.aggregate)
const mockTransactionCount = vi.mocked(prisma.transaction.count)
const mockCCUpsert = vi.mocked(prisma.creditCardDetails.upsert)
const mockLoanUpsert = vi.mocked(prisma.loan.upsert)
const mock$Transaction = vi.mocked(prisma.$transaction)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockTx = (prisma as any)._mockTx

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acc-1",
    name: "My Checking",
    type: "CHECKING",
    balance: decimal(1000),
    creditLimit: null,
    owner: null,
    isActive: true,
    userId: "user-1",
    creditCardDetails: null,
    loan: null,
    aprRates: [],
    transactions: [],
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── getAccounts ───────────────────────────────────────────────────────────────

describe("getAccounts", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getAccounts()).rejects.toThrow("Unauthorized")
  })

  it("returns accounts grouped by type in correct order", async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: "a1", name: "Checking", type: "CHECKING", balance: decimal(1000), creditLimit: null, owner: null, isActive: true },
      { id: "a2", name: "Savings", type: "SAVINGS", balance: decimal(5000), creditLimit: null, owner: null, isActive: true },
      { id: "a3", name: "Chase CC", type: "CREDIT_CARD", balance: decimal(-500), creditLimit: decimal(10000), owner: "Alice", isActive: true },
    ] as never)

    const result = await getAccounts()

    expect(result).toHaveLength(3)
    expect(result[0].type).toBe("CHECKING")
    expect(result[1].type).toBe("SAVINGS")
    expect(result[2].type).toBe("CREDIT_CARD")
  })

  it("only returns active accounts for the authenticated user", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)

    await getAccounts()

    expect(mockAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", isActive: true }),
      })
    )
  })

  it("calculates group totals correctly", async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: "a1", name: "Checking 1", type: "CHECKING", balance: decimal(1000), creditLimit: null, owner: null, isActive: true },
      { id: "a2", name: "Checking 2", type: "CHECKING", balance: decimal(2000), creditLimit: null, owner: null, isActive: true },
    ] as never)

    const result = await getAccounts()

    expect(result[0].total).toBe(3000)
  })

  it("omits empty type groups", async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: "a1", name: "Savings", type: "SAVINGS", balance: decimal(5000), creditLimit: null, owner: null, isActive: true },
    ] as never)

    const result = await getAccounts()

    expect(result).toHaveLength(1)
    expect(result[0].type).toBe("SAVINGS")
  })

  it("converts Decimal balances and creditLimit to numbers", async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: "a1", name: "CC", type: "CREDIT_CARD", balance: decimal(-500.50), creditLimit: decimal(5000), owner: null, isActive: true },
    ] as never)

    const result = await getAccounts()

    expect(typeof result[0].accounts[0].balance).toBe("number")
    expect(result[0].accounts[0].balance).toBe(-500.50)
    expect(result[0].accounts[0].creditLimit).toBe(5000)
  })
})

// ── getAccount ────────────────────────────────────────────────────────────────

describe("getAccount", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getAccount("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found when account does not exist", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(getAccount("acc-nonexistent")).rejects.toThrow("Account not found")
  })

  it("rejects access to another user's account (queries with userId)", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never) // userId mismatch → null

    await expect(getAccount("acc-other-user")).rejects.toThrow("Account not found")

    expect(mockAccountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "acc-other-user", userId: "user-1" }),
      })
    )
  })

  it("returns account with CC details when present", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({
        type: "CREDIT_CARD",
        balance: decimal(-1500),
        creditLimit: decimal(10000),
        creditCardDetails: {
          id: "cc-det-1",
          statementCloseDay: 15,
          paymentDueDay: 10,
          gracePeriodDays: 25,
          lastStatementBalance: decimal(1200),
          lastStatementPaidInFull: true,
          minimumPaymentPct: decimal(2),
          minimumPaymentFloor: decimal(25),
        },
      }) as never
    )
    // Mock for getBalanceHistory call within getAccount
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getAccount("acc-1")

    expect(result.creditCardDetails).not.toBeNull()
    expect(result.creditCardDetails!.statementCloseDay).toBe(15)
    expect(result.creditCardDetails!.lastStatementBalance).toBe(1200)
    expect(result.creditCardDetails!.lastStatementPaidInFull).toBe(true)
  })

  it("returns account with loan data when present", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({
        type: "MORTGAGE",
        balance: decimal(-250000),
        loan: {
          id: "loan-1",
          loanType: "MORTGAGE",
          originalBalance: decimal(285000),
          interestRate: decimal(6.75),
          termMonths: 360,
          startDate: new Date("2023-06-01"),
          monthlyPayment: decimal(1849),
          extraPaymentAmount: decimal(0),
        },
      }) as never
    )
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getAccount("acc-1")

    expect(result.loan).not.toBeNull()
    expect(result.loan!.loanType).toBe("MORTGAGE")
    expect(result.loan!.originalBalance).toBe(285000)
    expect(result.loan!.interestRate).toBe(6.75)
  })

  it("returns APR rates converted to numbers", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({
        aprRates: [
          {
            id: "apr-1",
            rateType: "STANDARD",
            apr: decimal(24.99),
            effectiveDate: new Date("2025-01-01"),
            expirationDate: null,
            description: "Standard rate",
            isActive: true,
          },
        ],
      }) as never
    )
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getAccount("acc-1")

    expect(result.aprRates).toHaveLength(1)
    expect(result.aprRates[0].apr).toBe(24.99)
    expect(result.aprRates[0].rateType).toBe("STANDARD")
  })

  // Transactions are now fetched separately via getAccountTransactions
})

// ── createAccount ─────────────────────────────────────────────────────────────

describe("createAccount", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(
      createAccount({ name: "Test", type: "CHECKING", balance: 0 })
    ).rejects.toThrow("Unauthorized")
  })

  it("creates a basic checking account", async () => {
    mockAccountCreate.mockResolvedValue({ id: "acc-new" } as never)

    const result = await createAccount({
      name: "New Checking",
      type: "CHECKING",
      balance: 0,
    })

    expect(result.id).toBe("acc-new")
    expect(mockAccountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "New Checking",
          type: "CHECKING",
          balance: 0,
          userId: "user-1",
        }),
      })
    )
  })

  it("creates CC details when type is CREDIT_CARD", async () => {
    mockAccountCreate.mockResolvedValue({ id: "acc-cc" } as never)

    await createAccount({
      name: "My CC",
      type: "CREDIT_CARD",
      balance: 0,
      creditLimit: 5000,
      creditCard: {
        statementCloseDay: 15,
        paymentDueDay: 10,
        gracePeriodDays: 25,
      },
    })

    expect(mockAccountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creditCardDetails: {
            create: {
              statementCloseDay: 15,
              paymentDueDay: 10,
              gracePeriodDays: 25,
            },
          },
        }),
      })
    )
  })

  it("creates loan details when type is LOAN", async () => {
    mockAccountCreate.mockResolvedValue({ id: "acc-loan" } as never)

    await createAccount({
      name: "Auto Loan",
      type: "LOAN",
      balance: -18500,
      loan: {
        loanType: "AUTO",
        originalBalance: 20000,
        interestRate: 5.49,
        termMonths: 60,
        startDate: "2025-01-01",
        monthlyPayment: 350,
        extraPaymentAmount: 0,
      },
    })

    expect(mockAccountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loan: {
            create: expect.objectContaining({
              loanType: "AUTO",
              originalBalance: 20000,
              interestRate: 5.49,
            }),
          },
        }),
      })
    )
  })

  it("creates loan details when type is MORTGAGE", async () => {
    mockAccountCreate.mockResolvedValue({ id: "acc-mortgage" } as never)

    await createAccount({
      name: "Home Loan",
      type: "MORTGAGE",
      balance: -250000,
      loan: {
        loanType: "MORTGAGE",
        originalBalance: 285000,
        interestRate: 6.75,
        termMonths: 360,
        startDate: "2023-06-01",
        monthlyPayment: 1849,
        extraPaymentAmount: 0,
      },
    })

    expect(mockAccountCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          loan: {
            create: expect.objectContaining({ loanType: "MORTGAGE" }),
          },
        }),
      })
    )
  })

  it("creates opening balance transaction for non-zero balance", async () => {
    mockAccountCreate.mockResolvedValue({ id: "acc-new" } as never)
    mockTransactionCreate.mockResolvedValue({} as never)

    await createAccount({
      name: "Savings",
      type: "SAVINGS",
      balance: 5000,
    })

    expect(mockTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Opening Balance",
        amount: 5000,
        type: "INCOME",
        category: "Opening Balance",
        source: "SYSTEM",
        userId: "user-1",
        accountId: "acc-new",
      }),
    })
  })

  it("creates EXPENSE type opening balance for negative balance", async () => {
    mockAccountCreate.mockResolvedValue({ id: "acc-cc" } as never)
    mockTransactionCreate.mockResolvedValue({} as never)

    await createAccount({
      name: "CC",
      type: "CREDIT_CARD",
      balance: -500,
    })

    expect(mockTransactionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: -500,
        type: "EXPENSE",
      }),
    })
  })

  it("does NOT create opening balance transaction for zero balance", async () => {
    mockAccountCreate.mockResolvedValue({ id: "acc-zero" } as never)

    await createAccount({
      name: "Empty",
      type: "CHECKING",
      balance: 0,
    })

    expect(mockTransactionCreate).not.toHaveBeenCalled()
  })
})

// ── updateAccount ─────────────────────────────────────────────────────────────

describe("updateAccount", () => {
  beforeEach(() => {
    mockAccountFindFirst.mockResolvedValue(makeAccount() as never)
    mockAccountUpdate.mockResolvedValue({} as never)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(
      updateAccount("acc-1", { name: "Updated", balance: 1000 })
    ).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found when account doesn't exist", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(
      updateAccount("acc-nonexistent", { name: "Updated", balance: 1000 })
    ).rejects.toThrow("Account not found")
  })

  it("updates basic account fields", async () => {
    await updateAccount("acc-1", { name: "Renamed", balance: 2000, owner: "Bob" })

    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: expect.objectContaining({
        name: "Renamed",
        balance: 2000,
        owner: "Bob",
      }),
    })
  })

  it("upserts CC details when account type is CREDIT_CARD", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ type: "CREDIT_CARD" }) as never)
    mockCCUpsert.mockResolvedValue({} as never)

    await updateAccount("acc-1", {
      name: "CC",
      balance: -500,
      creditCard: {
        statementCloseDay: 20,
        paymentDueDay: 15,
        gracePeriodDays: 21,
      },
    })

    expect(mockCCUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: "acc-1" },
        create: expect.objectContaining({ statementCloseDay: 20 }),
        update: expect.objectContaining({ statementCloseDay: 20 }),
      })
    )
  })

  it("upserts loan details when account type is LOAN", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ type: "LOAN" }) as never)
    mockLoanUpsert.mockResolvedValue({} as never)

    await updateAccount("acc-1", {
      name: "Loan",
      balance: -15000,
      loan: {
        loanType: "AUTO",
        originalBalance: 20000,
        interestRate: 5.49,
        termMonths: 60,
        startDate: "2025-01-01",
        monthlyPayment: 350,
        extraPaymentAmount: 0,
      },
    })

    expect(mockLoanUpsert).toHaveBeenCalled()
  })

  it("does NOT upsert CC details for non-CC account types", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ type: "CHECKING" }) as never)

    await updateAccount("acc-1", {
      name: "Checking",
      balance: 1000,
      creditCard: { statementCloseDay: 15, paymentDueDay: 10, gracePeriodDays: 25 },
    })

    expect(mockCCUpsert).not.toHaveBeenCalled()
  })

  it("returns { success: true }", async () => {
    const result = await updateAccount("acc-1", { name: "Updated", balance: 1000 })
    expect(result).toEqual({ success: true })
  })
})

// ── deleteAccount ─────────────────────────────────────────────────────────────

describe("deleteAccount", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(deleteAccount("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found for another user's account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(deleteAccount("acc-other")).rejects.toThrow("Account not found")
  })

  it("soft-deletes by setting isActive to false", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount() as never)
    mockAccountUpdate.mockResolvedValue({} as never)

    await deleteAccount("acc-1")

    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { isActive: false },
    })
  })

  it("verifies ownership by querying with userId", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount() as never)
    mockAccountUpdate.mockResolvedValue({} as never)

    await deleteAccount("acc-1")

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
    })
  })

  it("returns { success: true }", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount() as never)
    mockAccountUpdate.mockResolvedValue({} as never)

    const result = await deleteAccount("acc-1")
    expect(result).toEqual({ success: true })
  })
})

// ── getInactiveAccounts ───────────────────────────────────────────────────────

describe("getInactiveAccounts", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getInactiveAccounts()).rejects.toThrow("Unauthorized")
  })

  it("queries with isActive: false", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)

    await getInactiveAccounts()

    expect(mockAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1", isActive: false }),
      })
    )
  })

  it("returns inactive accounts grouped by type", async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: "a1", name: "Old Checking", type: "CHECKING", balance: decimal(500), creditLimit: null, owner: null, isActive: false },
      { id: "a2", name: "Old CC", type: "CREDIT_CARD", balance: decimal(-200), creditLimit: decimal(5000), owner: null, isActive: false },
    ] as never)

    const result = await getInactiveAccounts()

    expect(result).toHaveLength(2)
    expect(result[0].type).toBe("CHECKING")
    expect(result[1].type).toBe("CREDIT_CARD")
    expect(result[0].accounts[0].isActive).toBe(false)
  })
})

// ── reactivateAccount ─────────────────────────────────────────────────────────

describe("reactivateAccount", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(reactivateAccount("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found for non-existent account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(reactivateAccount("acc-nonexistent")).rejects.toThrow("Account not found")
  })

  it("sets isActive to true", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ isActive: false }) as never)
    mockAccountUpdate.mockResolvedValue({} as never)

    await reactivateAccount("acc-1")

    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { isActive: true },
    })
  })

  it("verifies ownership by querying with userId", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ isActive: false }) as never)
    mockAccountUpdate.mockResolvedValue({} as never)

    await reactivateAccount("acc-1")

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
    })
  })

  it("returns { success: true }", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ isActive: false }) as never)
    mockAccountUpdate.mockResolvedValue({} as never)

    const result = await reactivateAccount("acc-1")
    expect(result).toEqual({ success: true })
  })
})

// ── recalculateBalance ────────────────────────────────────────────────────────

describe("recalculateBalance", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(recalculateBalance("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found for non-existent account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(recalculateBalance("acc-bad")).rejects.toThrow("Account not found")
  })

  it("detects drift between stored and calculated balance", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({ balance: decimal(1000) }) as never
    )
    mockTransactionAggregate.mockResolvedValue({
      _sum: { amount: decimal(1050) },
    } as never)

    const result = await recalculateBalance("acc-1")

    expect(result.stored).toBe(1000)
    expect(result.calculated).toBe(1050)
    expect(result.drift).toBe(50)
  })

  it("returns zero drift when balances match", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({ balance: decimal(500) }) as never
    )
    mockTransactionAggregate.mockResolvedValue({
      _sum: { amount: decimal(500) },
    } as never)

    const result = await recalculateBalance("acc-1")

    expect(result.drift).toBe(0)
  })

  it("handles null aggregate sum (no transactions)", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({ balance: decimal(100) }) as never
    )
    mockTransactionAggregate.mockResolvedValue({
      _sum: { amount: null },
    } as never)

    const result = await recalculateBalance("acc-1")

    expect(result.calculated).toBe(0)
    expect(result.drift).toBe(-100)
  })
})

// ── confirmRecalculate ────────────────────────────────────────────────────────

describe("confirmRecalculate", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(confirmRecalculate("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("applies the recalculated balance", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount() as never)
    mockTransactionAggregate.mockResolvedValue({
      _sum: { amount: decimal(1050) },
    } as never)
    mockAccountUpdate.mockResolvedValue({} as never)

    const result = await confirmRecalculate("acc-1")

    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: 1050 },
    })
    expect(result.balance).toBe(1050)
  })
})

// ── recalculateAllBalances ────────────────────────────────────────────────────

describe("recalculateAllBalances", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(recalculateAllBalances()).rejects.toThrow("Unauthorized")
  })

  it("returns drift report for all active accounts", async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: "acc-1", name: "Checking", type: "CHECKING", balance: decimal(1000) },
      { id: "acc-2", name: "Savings", type: "SAVINGS", balance: decimal(5000) },
    ] as never)
    mockTransactionAggregate
      .mockResolvedValueOnce({ _sum: { amount: decimal(1000) } } as never) // acc-1: no drift
      .mockResolvedValueOnce({ _sum: { amount: decimal(4900) } } as never) // acc-2: drift of -100

    const results = await recalculateAllBalances()

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      accountId: "acc-1",
      name: "Checking",
      storedBalance: 1000,
      calculatedBalance: 1000,
      drift: 0,
    })
    expect(results[1]).toMatchObject({
      accountId: "acc-2",
      name: "Savings",
      storedBalance: 5000,
      calculatedBalance: 4900,
      drift: -100,
    })
  })

  it("only queries active accounts", async () => {
    mockAccountFindMany.mockResolvedValue([] as never)

    await recalculateAllBalances()

    expect(mockAccountFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      })
    )
  })
})

// ── confirmRecalculateAll ─────────────────────────────────────────────────────

describe("confirmRecalculateAll", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(confirmRecalculateAll()).rejects.toThrow("Unauthorized")
  })

  it("only updates accounts with drift", async () => {
    mockAccountFindMany.mockResolvedValue([
      { id: "acc-1", balance: decimal(1000) },
      { id: "acc-2", balance: decimal(5000) },
    ] as never)
    mockTransactionAggregate
      .mockResolvedValueOnce({ _sum: { amount: decimal(1000) } } as never) // no drift
      .mockResolvedValueOnce({ _sum: { amount: decimal(4900) } } as never) // drift
    mockAccountUpdate.mockResolvedValue({} as never)

    const results = await confirmRecalculateAll()

    // Only acc-2 should have been updated
    expect(mockAccountUpdate).toHaveBeenCalledTimes(1)
    expect(mockAccountUpdate).toHaveBeenCalledWith({
      where: { id: "acc-2" },
      data: { balance: 4900 },
    })

    expect(results[0]).toMatchObject({ accountId: "acc-1", corrected: false })
    expect(results[1]).toMatchObject({ accountId: "acc-2", corrected: true, balance: 4900 })
  })
})

// ── getBalanceHistory ─────────────────────────────────────────────────────────

describe("getBalanceHistory", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getBalanceHistory("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found for non-existent account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(getBalanceHistory("acc-bad")).rejects.toThrow("Account not found")
  })

  it("returns correct month-by-month balances", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({ balance: decimal(3000) }) as never
    )
    // Simulate transactions in the last few months
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)

    mockTransactionFindMany.mockResolvedValue([
      { date: lastMonth, amount: decimal(500) },
      { date: thisMonth, amount: decimal(1000) },
    ] as never)

    const result = await getBalanceHistory("acc-1", 12)

    expect(result).toHaveLength(12)
    // Most recent month should be current balance
    const lastEntry = result[result.length - 1]
    expect(lastEntry.balance).toBe(3000)
  })

  it("defaults to 12 months", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({ balance: decimal(1000) }) as never
    )
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getBalanceHistory("acc-1")

    expect(result).toHaveLength(12)
  })

  it("all entries have date and balance fields", async () => {
    mockAccountFindFirst.mockResolvedValue(
      makeAccount({ balance: decimal(1000) }) as never
    )
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getBalanceHistory("acc-1")

    result.forEach((entry) => {
      expect(entry).toHaveProperty("date")
      expect(entry).toHaveProperty("balance")
      expect(typeof entry.balance).toBe("number")
      expect(entry.date).toMatch(/^\d{4}-\d{2}$/)
    })
  })
})

// ── getAccountTransactions ──────────────────────────────────────────────────

describe("getAccountTransactions", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getAccountTransactions("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found for non-existent account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(getAccountTransactions("acc-bad")).rejects.toThrow("Account not found")
  })

  it("returns paginated transactions with correct totals", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount() as never)
    mockTransactionFindMany.mockResolvedValue([
      { id: "txn-1", date: new Date("2026-01-15"), description: "Coffee", amount: decimal(-5.50), type: "EXPENSE", category: "Food" },
      { id: "txn-2", date: new Date("2026-01-14"), description: "Salary", amount: decimal(3000), type: "INCOME", category: "Salary" },
    ] as never)
    mockTransactionCount.mockResolvedValue(25 as never)

    const result = await getAccountTransactions("acc-1", { page: 1, pageSize: 10 })

    expect(result.transactions).toHaveLength(2)
    expect(result.transactions[0].amount).toBe(-5.50)
    expect(result.total).toBe(25)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(10)
    expect(result.totalPages).toBe(3)
  })

  it("passes correct skip/take for pagination", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)
    mockTransactionCount.mockResolvedValue(0 as never)

    await getAccountTransactions("acc-1", { page: 3, pageSize: 5 })

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: "acc-1" },
        skip: 10,
        take: 5,
      })
    )
  })
})

// ── permanentlyDeleteAccount ────────────────────────────────────────────────

describe("permanentlyDeleteAccount", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(permanentlyDeleteAccount("acc-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found for non-existent account", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(permanentlyDeleteAccount("acc-bad")).rejects.toThrow("Account not found")
  })

  it("throws if account is still active", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ isActive: true }) as never)
    await expect(permanentlyDeleteAccount("acc-1")).rejects.toThrow("Cannot permanently delete an active account")
  })

  it("nulls linked transaction FKs before deleting", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ isActive: false }) as never)
    vi.mocked(mockTx.transaction.findMany).mockResolvedValue([
      { id: "txn-1" },
      { id: "txn-2" },
    ] as never)
    vi.mocked(mockTx.transaction.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(mockTx.account.delete).mockResolvedValue({} as never)

    await permanentlyDeleteAccount("acc-1")

    // Should null out outgoing links (from this account)
    expect(mockTx.transaction.updateMany).toHaveBeenCalledWith({
      where: { accountId: "acc-1", linkedTransactionId: { not: null } },
      data: { linkedTransactionId: null },
    })

    // Should null out incoming links (from other accounts)
    expect(mockTx.transaction.updateMany).toHaveBeenCalledWith({
      where: { linkedTransactionId: { in: ["txn-1", "txn-2"] } },
      data: { linkedTransactionId: null },
    })
  })

  it("hard-deletes the account", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ isActive: false }) as never)
    vi.mocked(mockTx.transaction.findMany).mockResolvedValue([] as never)
    vi.mocked(mockTx.account.delete).mockResolvedValue({} as never)

    const result = await permanentlyDeleteAccount("acc-1")

    expect(mockTx.account.delete).toHaveBeenCalledWith({ where: { id: "acc-1" } })
    expect(result).toEqual({ success: true })
  })

  it("skips FK nulling when account has no transactions", async () => {
    mockAccountFindFirst.mockResolvedValue(makeAccount({ isActive: false }) as never)
    vi.mocked(mockTx.transaction.findMany).mockResolvedValue([] as never)
    vi.mocked(mockTx.account.delete).mockResolvedValue({} as never)

    await permanentlyDeleteAccount("acc-1")

    expect(mockTx.transaction.updateMany).not.toHaveBeenCalled()
  })
})
