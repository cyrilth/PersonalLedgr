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
      delete: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
  }

  return {
    prisma: {
      account: {
        findFirst: vi.fn(),
      },
      transaction: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
      _txClient: txClient,
    },
  }
})

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  bulkCategorize,
} from "../transactions"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockFindMany = vi.mocked(prisma.transaction.findMany)
const mockCount = vi.mocked(prisma.transaction.count)
const mockFindFirst = vi.mocked(prisma.transaction.findFirst)
const mockUpdateMany = vi.mocked(prisma.transaction.updateMany)
const mockAccountFindFirst = vi.mocked(prisma.account.findFirst)
const mockPrismaTransaction = vi.mocked(prisma.$transaction)

// Access inner tx client methods for assertion
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const txClient = (prisma as any)._txClient as {
  transaction: { create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> }
  account: { update: ReturnType<typeof vi.fn> }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

/** Wrap a number as a Prisma Decimal-like object with toNumber() */
function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

function makeTransaction(overrides: Partial<{
  id: string
  date: Date
  description: string
  amount: ReturnType<typeof decimal>
  type: string
  category: string | null
  source: string
  notes: string | null
  accountId: string
  userId: string
  linkedTransactionId: string | null
  linkedTransaction: null | { id: string; accountId: string; amount: ReturnType<typeof decimal> }
  linkedBy: null | { id: string; accountId: string; amount: ReturnType<typeof decimal> }
  account: { id: string; name: string; type: string }
}> = {}) {
  return {
    id: "txn-1",
    date: new Date("2026-01-15"),
    description: "Test transaction",
    amount: decimal(100),
    type: "EXPENSE",
    category: "Food",
    source: "MANUAL",
    notes: null,
    accountId: "acc-1",
    userId: "user-1",
    linkedTransactionId: null,
    linkedTransaction: null,
    linkedBy: null,
    account: { id: "acc-1", name: "Checking", type: "CHECKING" },
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── getTransactions ───────────────────────────────────────────────────────────

describe("getTransactions", () => {
  beforeEach(() => {
    mockFindMany.mockResolvedValue([makeTransaction()] as never)
    mockCount.mockResolvedValue(1)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getTransactions()).rejects.toThrow("Unauthorized")
  })

  it("returns correct shape with defaults", async () => {
    const result = await getTransactions()

    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(50)
    expect(result.total).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.transactions).toHaveLength(1)
  })

  it("converts Decimal amounts via toNumber", async () => {
    mockFindMany.mockResolvedValue([makeTransaction({ amount: decimal(123.45) })] as never)
    const result = await getTransactions()
    expect(result.transactions[0].amount).toBe(123.45)
  })

  it("builds where clause with userId always present", async () => {
    await getTransactions()

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: "user-1" }),
      })
    )
  })

  it("adds accountId filter when provided", async () => {
    await getTransactions({ accountId: "acc-2" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountId: "acc-2" }),
      })
    )
  })

  it("adds single type filter as { in: [type] }", async () => {
    await getTransactions({ type: "EXPENSE" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: { in: ["EXPENSE"] } }),
      })
    )
  })

  it("adds array type filter as { in: types }", async () => {
    await getTransactions({ type: ["INCOME", "INTEREST_EARNED"] })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: { in: ["INCOME", "INTEREST_EARNED"] } }),
      })
    )
  })

  it("adds category filter when provided", async () => {
    await getTransactions({ category: "Food" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: "Food" }),
      })
    )
  })

  it("builds date filter with gte only when only dateFrom provided", async () => {
    await getTransactions({ dateFrom: "2026-01-01" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({ gte: new Date("2026-01-01") }),
        }),
      })
    )
  })

  it("builds date filter with lte only when only dateTo provided", async () => {
    await getTransactions({ dateTo: "2026-01-31" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: expect.objectContaining({ lte: new Date("2026-01-31") }),
        }),
      })
    )
  })

  it("builds full date range filter when both dateFrom and dateTo provided", async () => {
    await getTransactions({ dateFrom: "2026-01-01", dateTo: "2026-01-31" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          date: { gte: new Date("2026-01-01"), lte: new Date("2026-01-31") },
        }),
      })
    )
  })

  it("adds case-insensitive search filter when search provided", async () => {
    await getTransactions({ search: "coffee" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          description: { contains: "coffee", mode: "insensitive" },
        }),
      })
    )
  })

  it("always filters to active accounts by default", async () => {
    await getTransactions()

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: expect.objectContaining({ isActive: true }),
        }),
      })
    )
  })

  it("adds owner filter merged with active account condition", async () => {
    await getTransactions({ owner: "Alice" })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          account: { isActive: true, owner: "Alice" },
        }),
      })
    )
  })

  it("applies pagination skip and take correctly", async () => {
    await getTransactions({ page: 3, pageSize: 20 })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 40, // (3 - 1) * 20
        take: 20,
      })
    )
  })

  it("calculates totalPages correctly for partial last page", async () => {
    mockCount.mockResolvedValue(55)
    const result = await getTransactions({ pageSize: 50 })
    expect(result.totalPages).toBe(2)
  })

  it("calculates totalPages as 1 when total equals pageSize exactly", async () => {
    mockCount.mockResolvedValue(50)
    const result = await getTransactions({ pageSize: 50 })
    expect(result.totalPages).toBe(1)
  })

  it("returns all mapped transaction fields in correct shape", async () => {
    const txn = makeTransaction({
      id: "txn-abc",
      description: "Grocery run",
      amount: decimal(42.50),
      type: "EXPENSE",
      category: "Groceries",
      source: "MANUAL",
      notes: "Weekly shop",
      accountId: "acc-1",
      linkedTransactionId: null,
      account: { id: "acc-1", name: "Checking", type: "CHECKING" },
    })
    mockFindMany.mockResolvedValue([txn] as never)

    const result = await getTransactions()
    const t = result.transactions[0]

    expect(t.id).toBe("txn-abc")
    expect(t.description).toBe("Grocery run")
    expect(t.amount).toBe(42.50)
    expect(t.type).toBe("EXPENSE")
    expect(t.category).toBe("Groceries")
    expect(t.source).toBe("MANUAL")
    expect(t.notes).toBe("Weekly shop")
    expect(t.accountId).toBe("acc-1")
    expect(t.linkedTransactionId).toBeNull()
    expect(t.account).toEqual({ id: "acc-1", name: "Checking", type: "CHECKING" })
  })

  it("passes same where clause to both findMany and count", async () => {
    await getTransactions({ accountId: "acc-5", category: "Travel" })

    const findManyWhere = mockFindMany.mock.calls[0]?.[0]?.where
    const countWhere = mockCount.mock.calls[0]?.[0]?.where

    expect(findManyWhere).toEqual(countWhere)
  })
})

// ── createTransaction ─────────────────────────────────────────────────────────

describe("createTransaction", () => {
  const validInput = {
    date: "2026-01-15",
    description: "Coffee",
    amount: 5.50,
    type: "EXPENSE",
    category: "Food",
    accountId: "acc-1",
  }

  const mockCreatedTxn = makeTransaction({
    id: "txn-new",
    description: "Coffee",
    amount: decimal(5.50),
    type: "EXPENSE",
    category: "Food",
    source: "MANUAL",
    notes: null,
    accountId: "acc-1",
  })

  beforeEach(() => {
    mockAccountFindFirst.mockResolvedValue({ id: "acc-1", userId: "user-1" } as never)
    txClient.transaction.create.mockResolvedValue(mockCreatedTxn)
    txClient.account.update.mockResolvedValue({} as never)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(createTransaction(validInput)).rejects.toThrow("Unauthorized")
  })

  it("throws Account not found when account does not belong to user", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)
    await expect(createTransaction(validInput)).rejects.toThrow("Account not found")
  })

  it("verifies account ownership by querying with userId", async () => {
    await createTransaction(validInput)

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" },
    })
  })

  it("creates transaction inside a $transaction block", async () => {
    await createTransaction(validInput)
    expect(mockPrismaTransaction).toHaveBeenCalledOnce()
  })

  it("creates transaction with correct data", async () => {
    await createTransaction(validInput)

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        description: "Coffee",
        amount: 5.50,
        type: "EXPENSE",
        category: "Food",
        userId: "user-1",
        accountId: "acc-1",
      }),
    })
  })

  it("defaults source to MANUAL when not provided", async () => {
    await createTransaction(validInput)

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "MANUAL" }),
    })
  })

  it("uses provided source when specified", async () => {
    await createTransaction({ ...validInput, source: "IMPORT" })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: "IMPORT" }),
    })
  })

  it("increments account balance by the transaction amount", async () => {
    await createTransaction(validInput)

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { increment: 5.50 } },
    })
  })

  it("converts date string to Date object", async () => {
    await createTransaction(validInput)

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ date: new Date("2026-01-15") }),
    })
  })

  it("stores null category when category is empty string", async () => {
    await createTransaction({ ...validInput, category: "" })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ category: null }),
    })
  })

  it("stores null notes when notes is empty string", async () => {
    await createTransaction({ ...validInput, notes: "" })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ notes: null }),
    })
  })

  it("returns transaction with amount converted from Decimal", async () => {
    const result = await createTransaction(validInput)

    expect(result.amount).toBe(5.50)
    expect(typeof result.amount).toBe("number")
  })

  it("passes aprRateId through to Prisma when provided", async () => {
    await createTransaction({ ...validInput, aprRateId: "apr-1" })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ aprRateId: "apr-1" }),
    })
  })

  it("stores null aprRateId when not provided", async () => {
    await createTransaction(validInput)

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ aprRateId: null }),
    })
  })

  it("stores null aprRateId when empty string provided", async () => {
    await createTransaction({ ...validInput, aprRateId: "" })

    expect(txClient.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ aprRateId: null }),
    })
  })

  it("returns correct shape from createTransaction", async () => {
    const result = await createTransaction(validInput)

    expect(result).toMatchObject({
      id: "txn-new",
      description: "Coffee",
      amount: 5.50,
      type: "EXPENSE",
      category: "Food",
      source: "MANUAL",
      notes: null,
      accountId: "acc-1",
    })
    expect(result.date).toBeInstanceOf(Date)
  })
})

// ── updateTransaction ─────────────────────────────────────────────────────────

describe("updateTransaction", () => {
  const existingTxn = makeTransaction({
    id: "txn-1",
    amount: decimal(100),
    accountId: "acc-1",
    linkedTransaction: null,
    linkedBy: null,
  })

  const updatedResult = makeTransaction({
    id: "txn-1",
    description: "Updated description",
    amount: decimal(150),
    type: "EXPENSE",
    category: "Shopping",
    source: "MANUAL",
    notes: null,
    accountId: "acc-1",
  })

  beforeEach(() => {
    mockFindFirst.mockResolvedValue(existingTxn as never)
    txClient.account.update.mockResolvedValue({} as never)
    txClient.transaction.update.mockResolvedValue(updatedResult)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(updateTransaction("txn-1", { amount: 150 })).rejects.toThrow("Unauthorized")
  })

  it("throws Transaction not found when transaction does not exist", async () => {
    mockFindFirst.mockResolvedValue(null as never)
    await expect(updateTransaction("txn-1", { amount: 150 })).rejects.toThrow("Transaction not found")
  })

  it("looks up transaction by id and userId", async () => {
    await updateTransaction("txn-1", { amount: 150 })

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "txn-1", userId: "user-1" },
    })
  })

  it("runs balance adjustments inside $transaction block", async () => {
    await updateTransaction("txn-1", { amount: 150 })
    expect(mockPrismaTransaction).toHaveBeenCalledOnce()
  })

  it("reverses old balance on the original account", async () => {
    await updateTransaction("txn-1", { amount: 150 })

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { decrement: 100 } },
    })
  })

  it("applies new balance on the same account when accountId unchanged", async () => {
    await updateTransaction("txn-1", { amount: 150 })

    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { increment: 150 } },
    })
  })

  it("keeps old amount when amount not provided in update data", async () => {
    await updateTransaction("txn-1", { description: "Just a rename" })

    // Should decrement old amount (100) and increment old amount (100) — net zero
    expect(txClient.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { decrement: 100 } } })
    )
    expect(txClient.account.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { balance: { increment: 100 } } })
    )
  })

  it("reverses old account balance and applies to new account when accountId changes", async () => {
    mockAccountFindFirst.mockResolvedValue({ id: "acc-2", userId: "user-1" } as never)

    await updateTransaction("txn-1", { amount: 150, accountId: "acc-2" })

    // Reverse old account
    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { balance: { decrement: 100 } },
    })
    // Apply to new account
    expect(txClient.account.update).toHaveBeenCalledWith({
      where: { id: "acc-2" },
      data: { balance: { increment: 150 } },
    })
  })

  it("verifies new account ownership when accountId changes", async () => {
    mockAccountFindFirst.mockResolvedValue({ id: "acc-2", userId: "user-1" } as never)

    await updateTransaction("txn-1", { accountId: "acc-2" })

    expect(mockAccountFindFirst).toHaveBeenCalledWith({
      where: { id: "acc-2", userId: "user-1" },
    })
  })

  it("throws Account not found when new account does not belong to user", async () => {
    mockAccountFindFirst.mockResolvedValue(null as never)

    await expect(updateTransaction("txn-1", { accountId: "acc-other" })).rejects.toThrow(
      "Account not found"
    )
  })

  it("does not query new account ownership when accountId unchanged", async () => {
    await updateTransaction("txn-1", { description: "No account change" })
    expect(mockAccountFindFirst).not.toHaveBeenCalled()
  })

  it("updates the transaction record with provided fields", async () => {
    await updateTransaction("txn-1", {
      description: "Updated",
      amount: 150,
      type: "INCOME",
      category: "Salary",
      notes: "Bonus",
    })

    expect(txClient.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: expect.objectContaining({
        description: "Updated",
        amount: 150,
        type: "INCOME",
        category: "Salary",
        notes: "Bonus",
      }),
    })
  })

  it("converts date string to Date object in update data", async () => {
    await updateTransaction("txn-1", { date: "2026-06-01" })

    expect(txClient.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: expect.objectContaining({ date: new Date("2026-06-01") }),
    })
  })

  it("stores null category when category is empty string", async () => {
    await updateTransaction("txn-1", { category: "" })

    expect(txClient.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: expect.objectContaining({ category: null }),
    })
  })

  it("stores null notes when notes is empty string", async () => {
    await updateTransaction("txn-1", { notes: "" })

    expect(txClient.transaction.update).toHaveBeenCalledWith({
      where: { id: "txn-1" },
      data: expect.objectContaining({ notes: null }),
    })
  })

  it("returns updated transaction with amount converted from Decimal", async () => {
    const result = await updateTransaction("txn-1", { amount: 150 })

    expect(result.amount).toBe(150)
    expect(typeof result.amount).toBe("number")
  })

  it("does not include undefined fields in updateData", async () => {
    await updateTransaction("txn-1", { description: "Only description" })

    const updateCall = txClient.transaction.update.mock.calls[0][0]
    expect(updateCall.data).not.toHaveProperty("amount")
    expect(updateCall.data).not.toHaveProperty("type")
    expect(updateCall.data).not.toHaveProperty("category")
  })
})

// ── deleteTransaction ─────────────────────────────────────────────────────────

describe("deleteTransaction", () => {
  const standaloneTxn = makeTransaction({
    id: "txn-1",
    amount: decimal(50),
    accountId: "acc-1",
    linkedTransactionId: null,
    linkedTransaction: null,
    linkedBy: null,
    billPayment: null,
  })

  beforeEach(() => {
    txClient.account.update.mockResolvedValue({} as never)
    txClient.transaction.update.mockResolvedValue({} as never)
    txClient.transaction.delete.mockResolvedValue({} as never)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(deleteTransaction("txn-1")).rejects.toThrow("Unauthorized")
  })

  it("throws Transaction not found when transaction does not exist", async () => {
    mockFindFirst.mockResolvedValue(null as never)
    await expect(deleteTransaction("txn-1")).rejects.toThrow("Transaction not found")
  })

  it("looks up transaction by id and userId with linked includes", async () => {
    mockFindFirst.mockResolvedValue(standaloneTxn as never)
    await deleteTransaction("txn-1")

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: "txn-1", userId: "user-1" },
      include: {
        linkedTransaction: true,
        linkedBy: true,
        billPayment: {
          include: { recurringBill: { select: { name: true } } },
        },
      },
    })
  })

  it("runs all operations inside $transaction block", async () => {
    mockFindFirst.mockResolvedValue(standaloneTxn as never)
    await deleteTransaction("txn-1")
    expect(mockPrismaTransaction).toHaveBeenCalledOnce()
  })

  it("returns { success: true } on successful delete", async () => {
    mockFindFirst.mockResolvedValue(standaloneTxn as never)
    const result = await deleteTransaction("txn-1")
    expect(result).toEqual({ success: true, warnings: [] })
  })

  describe("standalone transaction", () => {
    beforeEach(() => {
      mockFindFirst.mockResolvedValue(standaloneTxn as never)
    })

    it("reverses balance by decrementing account by the transaction amount", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.account.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: { balance: { decrement: 50 } },
      })
    })

    it("deletes only the single transaction", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.transaction.delete).toHaveBeenCalledTimes(1)
      expect(txClient.transaction.delete).toHaveBeenCalledWith({ where: { id: "txn-1" } })
    })

    it("does not null out any linkedTransactionId", async () => {
      await deleteTransaction("txn-1")
      expect(txClient.transaction.update).not.toHaveBeenCalled()
    })
  })

  describe("transfer pair - primary side (has linkedTransactionId set)", () => {
    const partner = {
      id: "txn-2",
      accountId: "acc-2",
      amount: decimal(-50),
    }
    const primaryTxn = makeTransaction({
      id: "txn-1",
      amount: decimal(50),
      accountId: "acc-1",
      linkedTransactionId: "txn-2",
      linkedTransaction: partner as never,
      linkedBy: null,
    })

    beforeEach(() => {
      mockFindFirst.mockResolvedValue(primaryTxn as never)
    })

    it("nulls linkedTransactionId on the primary (linking) side first", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.transaction.update).toHaveBeenCalledWith({
        where: { id: "txn-1" },
        data: { linkedTransactionId: null },
      })
    })

    it("reverses balance on both accounts", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.account.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: { balance: { decrement: 50 } },
      })
      expect(txClient.account.update).toHaveBeenCalledWith({
        where: { id: "acc-2" },
        data: { balance: { decrement: -50 } },
      })
    })

    it("deletes both transactions", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.transaction.delete).toHaveBeenCalledTimes(2)
      expect(txClient.transaction.delete).toHaveBeenCalledWith({ where: { id: "txn-1" } })
      expect(txClient.transaction.delete).toHaveBeenCalledWith({ where: { id: "txn-2" } })
    })
  })

  describe("transfer pair - secondary side (linked via linkedBy, no linkedTransactionId set)", () => {
    const partnerTxn = {
      id: "txn-2",
      accountId: "acc-2",
      amount: decimal(50),
    }
    const secondaryTxn = makeTransaction({
      id: "txn-1",
      amount: decimal(-50),
      accountId: "acc-1",
      linkedTransactionId: null, // no FK on this side
      linkedTransaction: null,
      linkedBy: partnerTxn as never,
    })

    beforeEach(() => {
      mockFindFirst.mockResolvedValue(secondaryTxn as never)
    })

    it("nulls linkedTransactionId on the partner (linking) side when secondary is deleted", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.transaction.update).toHaveBeenCalledWith({
        where: { id: "txn-2" },
        data: { linkedTransactionId: null },
      })
    })

    it("reverses balance on both accounts", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.account.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: { balance: { decrement: -50 } },
      })
      expect(txClient.account.update).toHaveBeenCalledWith({
        where: { id: "acc-2" },
        data: { balance: { decrement: 50 } },
      })
    })

    it("deletes both transactions", async () => {
      await deleteTransaction("txn-1")

      expect(txClient.transaction.delete).toHaveBeenCalledTimes(2)
      expect(txClient.transaction.delete).toHaveBeenCalledWith({ where: { id: "txn-1" } })
      expect(txClient.transaction.delete).toHaveBeenCalledWith({ where: { id: "txn-2" } })
    })
  })
})

// ── bulkCategorize ────────────────────────────────────────────────────────────

describe("bulkCategorize", () => {
  beforeEach(() => {
    mockUpdateMany.mockResolvedValue({ count: 3 } as never)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(bulkCategorize(["txn-1"], "Food")).rejects.toThrow("Unauthorized")
  })

  it("calls updateMany with correct where clause (ids + userId)", async () => {
    await bulkCategorize(["txn-1", "txn-2", "txn-3"], "Groceries")

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["txn-1", "txn-2", "txn-3"] }, userId: "user-1" },
      data: { category: "Groceries" },
    })
  })

  it("returns the count from updateMany", async () => {
    const result = await bulkCategorize(["txn-1", "txn-2", "txn-3"], "Groceries")
    expect(result).toEqual({ count: 3 })
  })

  it("returns count of 0 when no transactions matched", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never)
    const result = await bulkCategorize(["txn-unknown"], "Food")
    expect(result).toEqual({ count: 0 })
  })

  it("handles empty ids array", async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 } as never)
    await bulkCategorize([], "Food")

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [] }, userId: "user-1" },
      data: { category: "Food" },
    })
  })

  it("only updates transactions belonging to the authenticated user", async () => {
    await bulkCategorize(["txn-1"], "Travel")

    const callArgs = mockUpdateMany.mock.calls[0][0]
    expect(callArgs.where).toHaveProperty("userId", "user-1")
  })
})
