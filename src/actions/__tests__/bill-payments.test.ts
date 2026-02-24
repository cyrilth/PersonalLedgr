/**
 * Unit tests for src/actions/bill-payments.ts — Bill payment server actions.
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

vi.mock("@/db", () => {
  const mockTx = {
    transaction: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
    billPayment: {
      create: vi.fn(),
      delete: vi.fn(),
    },
  }

  return {
    prisma: {
      recurringBill: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      billPayment: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      transaction: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      _mockTx: mockTx,
    },
  }
})

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import {
  getBillPayments,
  recordBillPayment,
  linkTransactionToBill,
  getMatchingTransactions,
  deleteBillPayment,
} from "../bill-payments"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockRecurringBillFindMany = vi.mocked(prisma.recurringBill.findMany)
const mockRecurringBillFindFirst = vi.mocked(prisma.recurringBill.findFirst)
const mockBillPaymentFindMany = vi.mocked(prisma.billPayment.findMany)
const mockBillPaymentFindUnique = vi.mocked(prisma.billPayment.findUnique)
const mockBillPaymentCreate = vi.mocked(prisma.billPayment.create)
const mockTransactionFindMany = vi.mocked(prisma.transaction.findMany)
const mockTransactionFindFirst = vi.mocked(prisma.transaction.findFirst)
const mock$Transaction = vi.mocked(prisma.$transaction)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockTx = (prisma as any)._mockTx

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

/** Wrap a number as a Prisma Decimal-like object */
function decimal(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n) }
}

function makeRecurringBill(overrides: Record<string, unknown> = {}) {
  return {
    id: "bill-1",
    name: "Electric Bill",
    amount: decimal(120),
    category: "Utilities",
    userId: "user-1",
    accountId: "acc-1",
    isActive: true,
    ...overrides,
  }
}

function makeBillPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: "pay-1",
    recurringBillId: "bill-1",
    month: 2,
    year: 2026,
    amount: decimal(120),
    paidAt: new Date("2026-02-15"),
    transactionId: "txn-1",
    ...overrides,
  }
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "txn-1",
    date: new Date("2026-02-15"),
    description: "Electric Bill",
    amount: decimal(-120),
    type: "EXPENSE",
    source: "RECURRING",
    accountId: "acc-1",
    userId: "user-1",
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── getBillPayments ───────────────────────────────────────────────────────────

describe("getBillPayments", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getBillPayments(1, 2026, 12, 2026)).rejects.toThrow("Unauthorized")
  })

  it("returns empty object when user has no bills", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)

    const result = await getBillPayments(1, 2026, 12, 2026)

    expect(result).toEqual({})
    expect(mockBillPaymentFindMany).not.toHaveBeenCalled()
  })

  it("returns empty object when bills exist but no payments in range", async () => {
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }] as never)
    mockBillPaymentFindMany.mockResolvedValue([] as never)

    const result = await getBillPayments(1, 2026, 12, 2026)

    expect(result).toEqual({})
  })

  it("groups payments by recurringBillId", async () => {
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }, { id: "bill-2" }] as never)
    mockBillPaymentFindMany.mockResolvedValue([
      makeBillPayment({ id: "pay-1", recurringBillId: "bill-1", month: 1, year: 2026 }),
      makeBillPayment({ id: "pay-2", recurringBillId: "bill-1", month: 2, year: 2026 }),
      makeBillPayment({ id: "pay-3", recurringBillId: "bill-2", month: 1, year: 2026 }),
    ] as never)

    const result = await getBillPayments(1, 2026, 3, 2026)

    expect(Object.keys(result)).toHaveLength(2)
    expect(result["bill-1"]).toHaveLength(2)
    expect(result["bill-2"]).toHaveLength(1)
  })

  it("converts Decimal amount to number in returned records", async () => {
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }] as never)
    mockBillPaymentFindMany.mockResolvedValue([
      makeBillPayment({ amount: decimal(99.99) }),
    ] as never)

    const result = await getBillPayments(1, 2026, 12, 2026)

    expect(typeof result["bill-1"][0].amount).toBe("number")
    expect(result["bill-1"][0].amount).toBe(99.99)
  })

  it("maps all BillPaymentRecord fields correctly", async () => {
    const paidAt = new Date("2026-02-15")
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }] as never)
    mockBillPaymentFindMany.mockResolvedValue([
      makeBillPayment({ paidAt, transactionId: "txn-1" }),
    ] as never)

    const result = await getBillPayments(1, 2026, 12, 2026)
    const record = result["bill-1"][0]

    expect(record).toMatchObject({
      id: "pay-1",
      recurringBillId: "bill-1",
      month: 2,
      year: 2026,
      amount: 120,
      paidAt,
      transactionId: "txn-1",
    })
  })

  it("handles payments with null transactionId", async () => {
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }] as never)
    mockBillPaymentFindMany.mockResolvedValue([
      makeBillPayment({ transactionId: null }),
    ] as never)

    const result = await getBillPayments(1, 2026, 12, 2026)

    expect(result["bill-1"][0].transactionId).toBeNull()
  })

  it("queries payments scoped to user's bill IDs", async () => {
    mockRecurringBillFindMany.mockResolvedValue([
      { id: "bill-1" },
      { id: "bill-2" },
    ] as never)
    mockBillPaymentFindMany.mockResolvedValue([] as never)

    await getBillPayments(1, 2026, 3, 2026)

    expect(mockBillPaymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recurringBillId: { in: ["bill-1", "bill-2"] },
        }),
      })
    )
  })

  it("filters same-year range to exact month window", async () => {
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }] as never)
    // Return a payment for month 3 — outside the Jan–Feb window even though year matches
    mockBillPaymentFindMany.mockResolvedValue([
      makeBillPayment({ month: 3, year: 2026 }),
    ] as never)

    const result = await getBillPayments(1, 2026, 2, 2026)

    // Month 3 should be filtered out when startYear === endYear
    expect(result["bill-1"] ?? []).toHaveLength(0)
  })

  it("includes payments from start boundary month", async () => {
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }] as never)
    mockBillPaymentFindMany.mockResolvedValue([
      makeBillPayment({ month: 1, year: 2026 }),
    ] as never)

    const result = await getBillPayments(1, 2026, 3, 2026)

    expect(result["bill-1"]).toHaveLength(1)
  })

  it("includes payments from end boundary month", async () => {
    mockRecurringBillFindMany.mockResolvedValue([{ id: "bill-1" }] as never)
    mockBillPaymentFindMany.mockResolvedValue([
      makeBillPayment({ month: 3, year: 2026 }),
    ] as never)

    const result = await getBillPayments(1, 2026, 3, 2026)

    expect(result["bill-1"]).toHaveLength(1)
  })

  it("scopes recurringBill query to userId", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)

    await getBillPayments(1, 2026, 12, 2026)

    expect(mockRecurringBillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
      })
    )
  })
})

// ── recordBillPayment ─────────────────────────────────────────────────────────

describe("recordBillPayment", () => {
  const validData = {
    recurringBillId: "bill-1",
    amount: 120,
    month: 2,
    year: 2026,
    accountId: "acc-1",
  }

  beforeEach(() => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTx.transaction.create.mockResolvedValue(makeTransaction() as never)
    mockTx.account.update.mockResolvedValue({} as never)
    mockTx.billPayment.create.mockResolvedValue({ id: "pay-new" } as never)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(recordBillPayment(validData)).rejects.toThrow("Unauthorized")
  })

  it("throws 'Bill not found' when bill does not belong to user", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(null as never)
    await expect(recordBillPayment(validData)).rejects.toThrow("Bill not found")
  })

  it("allows multiple payments for the same bill/month/year", async () => {
    const result1 = await recordBillPayment(validData)
    expect(result1).toEqual({ billPaymentId: "pay-new", transactionId: "txn-1" })

    const result2 = await recordBillPayment(validData)
    expect(result2).toEqual({ billPaymentId: "pay-new", transactionId: "txn-1" })
  })

  it("creates an EXPENSE transaction inside $transaction", async () => {
    await recordBillPayment(validData)

    expect(mockTx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "EXPENSE",
          source: "RECURRING",
          userId: "user-1",
          accountId: "acc-1",
          description: "Electric Bill",
        }),
      })
    )
  })

  it("stores the transaction amount as a negative value", async () => {
    await recordBillPayment(validData)

    const call = mockTx.transaction.create.mock.calls[0][0] as { data: { amount: number } }
    expect(call.data.amount).toBe(-120)
  })

  it("always stores amount as negative even when positive input is provided", async () => {
    await recordBillPayment({ ...validData, amount: 200 })

    const call = mockTx.transaction.create.mock.calls[0][0] as { data: { amount: number } }
    expect(call.data.amount).toBe(-200)
  })

  it("decrements account balance by the absolute amount", async () => {
    await recordBillPayment(validData)

    expect(mockTx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-1" },
        data: { balance: { decrement: 120 } },
      })
    )
  })

  it("creates a BillPayment record linked to the new transaction", async () => {
    await recordBillPayment(validData)

    expect(mockTx.billPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recurringBillId: "bill-1",
          month: 2,
          year: 2026,
          transactionId: "txn-1",
        }),
      })
    )
  })

  it("stores the absolute amount on the BillPayment record", async () => {
    await recordBillPayment({ ...validData, amount: 120 })

    const call = mockTx.billPayment.create.mock.calls[0][0] as { data: { amount: number } }
    expect(call.data.amount).toBe(120)
  })

  it("uses the bill's category for the transaction", async () => {
    await recordBillPayment(validData)

    const call = mockTx.transaction.create.mock.calls[0][0] as { data: { category: string } }
    expect(call.data.category).toBe("Utilities")
  })

  it("handles bill with null category gracefully", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(
      makeRecurringBill({ category: null }) as never
    )

    await expect(recordBillPayment(validData)).resolves.not.toThrow()
  })

  it("uses provided date when given", async () => {
    const customDate = new Date("2026-02-10")
    await recordBillPayment({ ...validData, date: customDate })

    const call = mockTx.transaction.create.mock.calls[0][0] as { data: { date: Date } }
    expect(call.data.date).toBe(customDate)
  })

  it("defaults payment date to now when not provided", async () => {
    const before = new Date()
    await recordBillPayment(validData)
    const after = new Date()

    const call = mockTx.transaction.create.mock.calls[0][0] as { data: { date: Date } }
    expect(call.data.date.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(call.data.date.getTime()).toBeLessThanOrEqual(after.getTime())
  })

  it("uses Prisma $transaction for atomicity", async () => {
    await recordBillPayment(validData)
    expect(mock$Transaction).toHaveBeenCalledOnce()
  })

  it("returns billPaymentId and transactionId", async () => {
    const result = await recordBillPayment(validData)

    expect(result).toEqual({ billPaymentId: "pay-new", transactionId: "txn-1" })
  })

  it("scopes bill ownership check by userId", async () => {
    await recordBillPayment(validData)

    expect(mockRecurringBillFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "bill-1", userId: "user-1" }),
      })
    )
  })

  it("does not check for duplicate bill/month/year before creating", async () => {
    await recordBillPayment(validData)

    // The findUnique for recurringBillId_month_year should NOT be called
    // (the unique constraint was removed to allow multiple payments per month)
    expect(mockBillPaymentFindUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          recurringBillId_month_year: expect.anything(),
        }),
      })
    )
  })
})

// ── linkTransactionToBill ─────────────────────────────────────────────────────

describe("linkTransactionToBill", () => {
  const validData = {
    recurringBillId: "bill-1",
    transactionId: "txn-1",
    month: 2,
    year: 2026,
  }

  beforeEach(() => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindFirst.mockResolvedValue(makeTransaction() as never)
    mockBillPaymentFindUnique.mockResolvedValue(null as never)
    mockBillPaymentCreate.mockResolvedValue({ id: "pay-linked" } as never)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(linkTransactionToBill(validData)).rejects.toThrow("Unauthorized")
  })

  it("throws 'Bill not found' when bill does not belong to user", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(null as never)
    await expect(linkTransactionToBill(validData)).rejects.toThrow("Bill not found")
  })

  it("throws 'Transaction not found' when transaction does not belong to user", async () => {
    mockTransactionFindFirst.mockResolvedValue(null as never)
    await expect(linkTransactionToBill(validData)).rejects.toThrow("Transaction not found")
  })

  it("throws 'Transaction is already linked to a bill payment' if transaction already linked", async () => {
    // findUnique (transactionId check) returns existing payment
    mockBillPaymentFindUnique.mockResolvedValueOnce(makeBillPayment() as never)
    await expect(linkTransactionToBill(validData)).rejects.toThrow("Transaction is already linked to a bill payment")
  })

  it("creates a BillPayment record without creating a new transaction", async () => {
    await linkTransactionToBill(validData)

    expect(mockBillPaymentCreate).toHaveBeenCalledOnce()
    expect(mockTx.transaction.create).not.toHaveBeenCalled()
  })

  it("does not modify account balance", async () => {
    await linkTransactionToBill(validData)

    expect(mockTx.account.update).not.toHaveBeenCalled()
  })

  it("does not use $transaction for atomicity (no balance change needed)", async () => {
    await linkTransactionToBill(validData)

    expect(mock$Transaction).not.toHaveBeenCalled()
  })

  it("creates BillPayment with correct month, year, and transactionId", async () => {
    await linkTransactionToBill(validData)

    expect(mockBillPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recurringBillId: "bill-1",
          transactionId: "txn-1",
          month: 2,
          year: 2026,
        }),
      })
    )
  })

  it("derives amount from the existing transaction's absolute value", async () => {
    mockTransactionFindFirst.mockResolvedValue(
      makeTransaction({ amount: decimal(-85.5) }) as never
    )

    await linkTransactionToBill(validData)

    const call = mockBillPaymentCreate.mock.calls[0][0] as { data: { amount: number } }
    expect(call.data.amount).toBe(85.5)
  })

  it("handles positive transaction amounts by taking absolute value", async () => {
    mockTransactionFindFirst.mockResolvedValue(
      makeTransaction({ amount: decimal(85.5) }) as never
    )

    await linkTransactionToBill(validData)

    const call = mockBillPaymentCreate.mock.calls[0][0] as { data: { amount: number } }
    expect(call.data.amount).toBe(85.5)
  })

  it("returns billPaymentId on success", async () => {
    const result = await linkTransactionToBill(validData)

    expect(result).toEqual({ billPaymentId: "pay-linked" })
  })

  it("scopes bill ownership check by userId", async () => {
    await linkTransactionToBill(validData)

    expect(mockRecurringBillFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "bill-1", userId: "user-1" }),
      })
    )
  })

  it("scopes transaction ownership check by userId", async () => {
    await linkTransactionToBill(validData)

    expect(mockTransactionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "txn-1", userId: "user-1" }),
      })
    )
  })
})

// ── getMatchingTransactions ───────────────────────────────────────────────────

describe("getMatchingTransactions", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getMatchingTransactions("bill-1", 2, 2026)).rejects.toThrow("Unauthorized")
  })

  it("returns empty array when bill is not found", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(null as never)

    const result = await getMatchingTransactions("nonexistent", 2, 2026)

    expect(result).toEqual([])
    expect(mockTransactionFindMany).not.toHaveBeenCalled()
  })

  it("returns empty array when no matching transactions exist", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getMatchingTransactions("bill-1", 2, 2026)

    expect(result).toEqual([])
  })

  it("returns mapped MatchingTransaction objects", async () => {
    const txDate = new Date("2026-02-15")
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([
      makeTransaction({ date: txDate, description: "Electric Bill", amount: decimal(-120), source: "IMPORT" }),
    ] as never)

    const result = await getMatchingTransactions("bill-1", 2, 2026)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: "txn-1",
      date: txDate,
      description: "Electric Bill",
      amount: -120,
      source: "IMPORT",
    })
  })

  it("converts Decimal amount to number in results", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([
      makeTransaction({ amount: decimal(-55.75) }),
    ] as never)

    const result = await getMatchingTransactions("bill-1", 2, 2026)

    expect(typeof result[0].amount).toBe("number")
    expect(result[0].amount).toBe(-55.75)
  })

  it("queries only EXPENSE transactions", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMatchingTransactions("bill-1", 2, 2026)

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          type: "EXPENSE",
        }),
      })
    )
  })

  it("excludes transactions already linked to a bill payment", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMatchingTransactions("bill-1", 2, 2026)

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          billPayment: null,
        }),
      })
    )
  })

  it("uses a search window that starts 5 days before the month", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    // For month=2, year=2026: start is Feb 1 - 5 days = Jan 27
    await getMatchingTransactions("bill-1", 2, 2026)

    const call = mockTransactionFindMany.mock.calls[0][0] as {
      where: { date: { gte: Date; lte: Date } }
    }
    const startDate = call.where.date.gte
    expect(startDate.getMonth()).toBe(0) // January
    expect(startDate.getDate()).toBe(27)
  })

  it("uses a search window that ends 5 days after the last day of the month", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    // For month=2, year=2026: end is Feb 28 + 5 days = Mar 5
    await getMatchingTransactions("bill-1", 2, 2026)

    const call = mockTransactionFindMany.mock.calls[0][0] as {
      where: { date: { gte: Date; lte: Date } }
    }
    const endDate = call.where.date.lte
    expect(endDate.getMonth()).toBe(2) // March
    expect(endDate.getDate()).toBe(5)
  })

  it("limits results to 20 transactions", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMatchingTransactions("bill-1", 2, 2026)

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 })
    )
  })

  it("orders results by date descending", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMatchingTransactions("bill-1", 2, 2026)

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { date: "desc" } })
    )
  })

  it("scopes bill ownership check by userId", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getMatchingTransactions("bill-1", 2, 2026)

    expect(mockRecurringBillFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "bill-1", userId: "user-1" }),
      })
    )
  })
})

// ── deleteBillPayment ─────────────────────────────────────────────────────────

describe("deleteBillPayment", () => {
  function makePaymentWithIncludes(
    txSource: string | null = "RECURRING",
    txAmount = -120
  ) {
    return {
      id: "pay-1",
      recurringBill: { userId: "user-1" },
      transaction: txSource
        ? {
            id: "txn-1",
            amount: decimal(txAmount),
            accountId: "acc-1",
            source: txSource,
          }
        : null,
    }
  }

  beforeEach(() => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes() as never
    )
    mockTx.account.update.mockResolvedValue({} as never)
    mockTx.transaction.delete.mockResolvedValue({} as never)
    mockTx.billPayment.delete.mockResolvedValue({} as never)
  })

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(deleteBillPayment("pay-1")).rejects.toThrow("Unauthorized")
  })

  it("throws 'Payment not found' when payment does not exist", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(null as never)
    await expect(deleteBillPayment("nonexistent")).rejects.toThrow("Payment not found")
  })

  it("throws 'Payment not found' when payment belongs to another user", async () => {
    mockBillPaymentFindUnique.mockResolvedValue({
      id: "pay-1",
      recurringBill: { userId: "other-user" },
      transaction: null,
    } as never)
    await expect(deleteBillPayment("pay-1")).rejects.toThrow("Payment not found")
  })

  it("uses Prisma $transaction for atomicity", async () => {
    await deleteBillPayment("pay-1")
    expect(mock$Transaction).toHaveBeenCalledOnce()
  })

  // RECURRING source path (new transaction was created)

  it("reverses account balance when source is RECURRING", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes("RECURRING", -120) as never
    )

    await deleteBillPayment("pay-1")

    expect(mockTx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-1" },
        data: { balance: { increment: 120 } },
      })
    )
  })

  it("increments balance by absolute value of transaction amount", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes("RECURRING", -250.75) as never
    )

    await deleteBillPayment("pay-1")

    const call = mockTx.account.update.mock.calls[0][0] as {
      data: { balance: { increment: number } }
    }
    expect(call.data.balance.increment).toBe(250.75)
  })

  it("deletes the transaction when source is RECURRING", async () => {
    await deleteBillPayment("pay-1")

    expect(mockTx.transaction.delete).toHaveBeenCalledWith({
      where: { id: "txn-1" },
    })
  })

  it("does not explicitly delete BillPayment when source is RECURRING (cascade handles it)", async () => {
    await deleteBillPayment("pay-1")

    expect(mockTx.billPayment.delete).not.toHaveBeenCalled()
  })

  // Non-RECURRING source path (linked existing transaction)

  it("only deletes BillPayment when source is MANUAL", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes("MANUAL") as never
    )

    await deleteBillPayment("pay-1")

    expect(mockTx.billPayment.delete).toHaveBeenCalledWith({ where: { id: "pay-1" } })
    expect(mockTx.transaction.delete).not.toHaveBeenCalled()
    expect(mockTx.account.update).not.toHaveBeenCalled()
  })

  it("only deletes BillPayment when source is IMPORT", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes("IMPORT") as never
    )

    await deleteBillPayment("pay-1")

    expect(mockTx.billPayment.delete).toHaveBeenCalledWith({ where: { id: "pay-1" } })
    expect(mockTx.transaction.delete).not.toHaveBeenCalled()
  })

  it("only deletes BillPayment when no transaction is linked", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes(null) as never
    )

    await deleteBillPayment("pay-1")

    expect(mockTx.billPayment.delete).toHaveBeenCalledWith({ where: { id: "pay-1" } })
    expect(mockTx.transaction.delete).not.toHaveBeenCalled()
    expect(mockTx.account.update).not.toHaveBeenCalled()
  })

  it("preserves the original transaction when source is not RECURRING", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes("IMPORT") as never
    )

    await deleteBillPayment("pay-1")

    // Original transaction must not be deleted
    expect(mockTx.transaction.delete).not.toHaveBeenCalled()
  })

  it("returns { success: true } for RECURRING source deletion", async () => {
    const result = await deleteBillPayment("pay-1")
    expect(result).toEqual({ success: true })
  })

  it("returns { success: true } for non-RECURRING source deletion", async () => {
    mockBillPaymentFindUnique.mockResolvedValue(
      makePaymentWithIncludes("MANUAL") as never
    )

    const result = await deleteBillPayment("pay-1")
    expect(result).toEqual({ success: true })
  })

  it("fetches payment with recurringBill and transaction includes", async () => {
    await deleteBillPayment("pay-1")

    expect(mockBillPaymentFindUnique).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      include: {
        recurringBill: { select: { userId: true } },
        transaction: { select: { id: true, amount: true, accountId: true, source: true } },
      },
    })
  })
})
