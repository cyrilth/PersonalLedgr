/**
 * Unit tests for src/actions/recurring.ts — Recurring bill server actions.
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
    transaction: {
      update: vi.fn(),
      create: vi.fn(),
    },
    account: {
      update: vi.fn(),
    },
  }
  return {
    prisma: {
      recurringBill: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      transaction: {
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
  getRecurringBills,
  createRecurringBill,
  updateRecurringBill,
  deleteRecurringBill,
  getUpcomingBills,
  confirmVariableBill,
} from "../recurring"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockRecurringBillFindMany = vi.mocked(prisma.recurringBill.findMany)
const mockRecurringBillFindFirst = vi.mocked(prisma.recurringBill.findFirst)
const mockRecurringBillCreate = vi.mocked(prisma.recurringBill.create)
const mockRecurringBillUpdate = vi.mocked(prisma.recurringBill.update)
const mockTransactionFindFirst = vi.mocked(prisma.transaction.findFirst)
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
 * Factory for a mock RecurringBill record as Prisma would return.
 * Defaults to a MONTHLY Netflix bill; override any field via the spread.
 */
function makeRecurringBill(overrides: Record<string, unknown> = {}) {
  return {
    id: "bill-1",
    name: "Netflix",
    amount: decimal(15.99),
    frequency: "MONTHLY",
    dayOfMonth: 15,
    isVariableAmount: false,
    category: "Entertainment",
    isActive: true,
    nextDueDate: new Date("2026-03-15"),
    userId: "user-1",
    accountId: "acc-1",
    account: {
      id: "acc-1",
      name: "Checking",
    },
    ...overrides,
  }
}

/**
 * Factory for a mock pending Transaction record as Prisma would return.
 */
function makePendingTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "txn-1",
    amount: decimal(-80),
    accountId: "acc-1",
    userId: "user-1",
    notes: "PENDING_CONFIRMATION",
    description: "Electric Bill",
    type: "EXPENSE",
    date: new Date("2026-02-15"),
    ...overrides,
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── getRecurringBills ─────────────────────────────────────────────────────────

describe("getRecurringBills", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getRecurringBills()).rejects.toThrow("Unauthorized")
  })

  it("returns empty array when no bills exist", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)
    const bills = await getRecurringBills()
    expect(bills).toEqual([])
  })

  it("returns mapped bill summaries with account info", async () => {
    mockRecurringBillFindMany.mockResolvedValue([makeRecurringBill()] as never)

    const bills = await getRecurringBills()

    expect(bills).toHaveLength(1)
    expect(bills[0]).toMatchObject({
      id: "bill-1",
      name: "Netflix",
      amount: 15.99,
      frequency: "MONTHLY",
      dayOfMonth: 15,
      isVariableAmount: false,
      category: "Entertainment",
      isActive: true,
      account: { id: "acc-1", name: "Checking" },
    })
  })

  it("converts Decimal amounts to numbers", async () => {
    mockRecurringBillFindMany.mockResolvedValue([
      makeRecurringBill({ amount: decimal(99.99) }),
    ] as never)

    const bills = await getRecurringBills()

    expect(typeof bills[0].amount).toBe("number")
    expect(bills[0].amount).toBe(99.99)
  })

  it("queries only active bills scoped to the current user", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)
    await getRecurringBills()

    expect(mockRecurringBillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          isActive: true,
        }),
      })
    )
  })

  it("returns multiple bills sorted by nextDueDate", async () => {
    mockRecurringBillFindMany.mockResolvedValue([
      makeRecurringBill({ id: "bill-1", name: "Netflix", nextDueDate: new Date("2026-03-01") }),
      makeRecurringBill({ id: "bill-2", name: "Spotify", nextDueDate: new Date("2026-03-20") }),
    ] as never)

    const bills = await getRecurringBills()
    expect(bills).toHaveLength(2)
    expect(bills[0].name).toBe("Netflix")
    expect(bills[1].name).toBe("Spotify")
  })
})

// ── createRecurringBill ───────────────────────────────────────────────────────

describe("createRecurringBill", () => {
  const validData = {
    name: "Electric Bill",
    amount: 120,
    frequency: "MONTHLY" as const,
    dayOfMonth: 10,
    accountId: "acc-1",
  }

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(createRecurringBill(validData)).rejects.toThrow("Unauthorized")
  })

  it("throws 'Bill name is required' for empty name", async () => {
    await expect(createRecurringBill({ ...validData, name: "" })).rejects.toThrow("Bill name is required")
  })

  it("throws 'Bill name is required' for whitespace-only name", async () => {
    await expect(createRecurringBill({ ...validData, name: "   " })).rejects.toThrow("Bill name is required")
  })

  it("throws 'Amount must be positive' for zero amount", async () => {
    await expect(createRecurringBill({ ...validData, amount: 0 })).rejects.toThrow("Amount must be positive")
  })

  it("throws 'Amount must be positive' for negative amount", async () => {
    await expect(createRecurringBill({ ...validData, amount: -50 })).rejects.toThrow("Amount must be positive")
  })

  it("throws 'Day of month must be between 1 and 31' for day 0", async () => {
    await expect(createRecurringBill({ ...validData, dayOfMonth: 0 })).rejects.toThrow(
      "Day of month must be between 1 and 31"
    )
  })

  it("throws 'Day of month must be between 1 and 31' for day 32", async () => {
    await expect(createRecurringBill({ ...validData, dayOfMonth: 32 })).rejects.toThrow(
      "Day of month must be between 1 and 31"
    )
  })

  it("throws 'Account is required' for missing accountId", async () => {
    await expect(createRecurringBill({ ...validData, accountId: "" })).rejects.toThrow("Account is required")
  })

  it("creates a bill and returns its id", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    const result = await createRecurringBill(validData)

    expect(result).toEqual({ id: "bill-new" })
    expect(mockRecurringBillCreate).toHaveBeenCalledOnce()
  })

  it("creates bill with correct data including userId", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    await createRecurringBill(validData)

    expect(mockRecurringBillCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Electric Bill",
          amount: 120,
          frequency: "MONTHLY",
          dayOfMonth: 10,
          accountId: "acc-1",
          userId: "user-1",
          isVariableAmount: false,
        }),
      })
    )
  })

  it("defaults isVariableAmount to false when not provided", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    await createRecurringBill(validData)

    expect(mockRecurringBillCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isVariableAmount: false }),
      })
    )
  })

  it("passes isVariableAmount: true when explicitly set", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    await createRecurringBill({ ...validData, isVariableAmount: true })

    expect(mockRecurringBillCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isVariableAmount: true }),
      })
    )
  })

  it("trims bill name before saving", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    await createRecurringBill({ ...validData, name: "  Electric Bill  " })

    expect(mockRecurringBillCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Electric Bill" }),
      })
    )
  })

  it("accepts day 1 (lower boundary)", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)
    await expect(createRecurringBill({ ...validData, dayOfMonth: 1 })).resolves.not.toThrow()
  })

  it("accepts day 31 (upper boundary)", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)
    await expect(createRecurringBill({ ...validData, dayOfMonth: 31 })).resolves.not.toThrow()
  })

  it("stores null for category when not provided", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    await createRecurringBill(validData)

    expect(mockRecurringBillCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: null }),
      })
    )
  })

  it("stores the category when provided", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    await createRecurringBill({ ...validData, category: "Utilities" })

    expect(mockRecurringBillCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: "Utilities" }),
      })
    )
  })

  it("calculates nextDueDate as this month when day is in the future", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    // Today is 2026-02-23; dayOfMonth=28 is in the future this month
    await createRecurringBill({ ...validData, dayOfMonth: 28 })

    const call = mockRecurringBillCreate.mock.calls[0][0] as { data: { nextDueDate: Date } }
    const nextDue = call.data.nextDueDate
    expect(nextDue.getDate()).toBe(28)
    expect(nextDue.getMonth()).toBe(1) // February = 1
  })

  it("calculates nextDueDate as next month when day has already passed", async () => {
    mockRecurringBillCreate.mockResolvedValue({ id: "bill-new" } as never)

    // Today is 2026-02-23; dayOfMonth=1 has already passed in February
    await createRecurringBill({ ...validData, dayOfMonth: 1 })

    const call = mockRecurringBillCreate.mock.calls[0][0] as { data: { nextDueDate: Date } }
    const nextDue = call.data.nextDueDate
    expect(nextDue.getDate()).toBe(1)
    expect(nextDue.getMonth()).toBe(2) // March = 2
  })
})

// ── updateRecurringBill ───────────────────────────────────────────────────────

describe("updateRecurringBill", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(updateRecurringBill("bill-1", { name: "Updated" })).rejects.toThrow("Unauthorized")
  })

  it("throws 'Bill not found' for non-existent bill", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(null as never)
    await expect(updateRecurringBill("nonexistent", { name: "Updated" })).rejects.toThrow("Bill not found")
  })

  it("updates only the provided fields", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    mockRecurringBillUpdate.mockResolvedValue(makeRecurringBill({ name: "Updated" }) as never)

    await updateRecurringBill("bill-1", { name: "Updated" })

    expect(mockRecurringBillUpdate).toHaveBeenCalledWith({
      where: { id: "bill-1" },
      data: { name: "Updated" },
    })
  })

  it("updates amount field", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    await updateRecurringBill("bill-1", { amount: 200 })

    expect(mockRecurringBillUpdate).toHaveBeenCalledWith({
      where: { id: "bill-1" },
      data: { amount: 200 },
    })
  })

  it("recalculates nextDueDate when dayOfMonth changes", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    await updateRecurringBill("bill-1", { dayOfMonth: 20 })

    const call = mockRecurringBillUpdate.mock.calls[0][0] as { data: { nextDueDate: Date; dayOfMonth: number } }
    expect(call.data.dayOfMonth).toBe(20)
    expect(call.data.nextDueDate).toBeInstanceOf(Date)
    expect(call.data.nextDueDate.getDate()).toBe(20)
  })

  it("does not set nextDueDate when dayOfMonth is not in the update", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    await updateRecurringBill("bill-1", { name: "Renamed" })

    const call = mockRecurringBillUpdate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(call.data.nextDueDate).toBeUndefined()
  })

  it("converts empty category string to null", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    await updateRecurringBill("bill-1", { category: "" })

    expect(mockRecurringBillUpdate).toHaveBeenCalledWith({
      where: { id: "bill-1" },
      data: { category: null },
    })
  })

  it("scopes the lookup query by userId", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    await updateRecurringBill("bill-1", { name: "Updated" })

    expect(mockRecurringBillFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "bill-1", userId: "user-1" }),
      })
    )
  })

  it("returns { success: true } on update", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    const result = await updateRecurringBill("bill-1", { name: "Updated" })

    expect(result).toEqual({ success: true })
  })
})

// ── deleteRecurringBill ───────────────────────────────────────────────────────

describe("deleteRecurringBill", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(deleteRecurringBill("bill-1")).rejects.toThrow("Unauthorized")
  })

  it("throws 'Bill not found' for non-existent bill", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(null as never)
    await expect(deleteRecurringBill("nonexistent")).rejects.toThrow("Bill not found")
  })

  it("soft-deletes by setting isActive to false", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    await deleteRecurringBill("bill-1")

    expect(mockRecurringBillUpdate).toHaveBeenCalledWith({
      where: { id: "bill-1" },
      data: { isActive: false },
    })
  })

  it("does not hard-delete the record", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    await deleteRecurringBill("bill-1")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((prisma.recurringBill as any).delete).toBeUndefined()
  })

  it("returns { success: true } after soft delete", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)

    const result = await deleteRecurringBill("bill-1")

    expect(result).toEqual({ success: true })
  })

  it("scopes the lookup query by userId", async () => {
    mockRecurringBillFindFirst.mockResolvedValue(makeRecurringBill() as never)
    await deleteRecurringBill("bill-1")

    expect(mockRecurringBillFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "bill-1", userId: "user-1" }),
      })
    )
  })
})

// ── getUpcomingBills ──────────────────────────────────────────────────────────

describe("getUpcomingBills", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getUpcomingBills()).rejects.toThrow("Unauthorized")
  })

  it("returns empty array when no bills are due within the window", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)
    const bills = await getUpcomingBills(30)
    expect(bills).toEqual([])
  })

  it("returns bills within the date range with daysUntilDue", async () => {
    const dueSoon = new Date()
    dueSoon.setDate(dueSoon.getDate() + 5)

    mockRecurringBillFindMany.mockResolvedValue([
      makeRecurringBill({ nextDueDate: dueSoon }),
    ] as never)

    const bills = await getUpcomingBills(30)

    expect(bills).toHaveLength(1)
    expect(bills[0].daysUntilDue).toBeGreaterThanOrEqual(4)
    expect(bills[0].daysUntilDue).toBeLessThanOrEqual(6)
  })

  it("calculates daysUntilDue correctly for a bill due in 10 days", async () => {
    const now = new Date()
    const dueDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)

    mockRecurringBillFindMany.mockResolvedValue([
      makeRecurringBill({ nextDueDate: dueDate }),
    ] as never)

    const bills = await getUpcomingBills(30)

    expect(bills[0].daysUntilDue).toBe(10)
  })

  it("defaults to 30 days window when no argument provided", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)
    await getUpcomingBills()

    const call = mockRecurringBillFindMany.mock.calls[0][0] as {
      where: { nextDueDate: { lte: Date } }
    }
    const cutoff = call.where.nextDueDate.lte
    const now = new Date()
    const diffDays = Math.round((cutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(30)
  })

  it("respects custom days parameter", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)
    await getUpcomingBills(7)

    const call = mockRecurringBillFindMany.mock.calls[0][0] as {
      where: { nextDueDate: { lte: Date } }
    }
    const cutoff = call.where.nextDueDate.lte
    const now = new Date()
    const diffDays = Math.round((cutoff.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    expect(diffDays).toBe(7)
  })

  it("filters by active bills only", async () => {
    mockRecurringBillFindMany.mockResolvedValue([] as never)
    await getUpcomingBills(30)

    expect(mockRecurringBillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          isActive: true,
        }),
      })
    )
  })

  it("converts Decimal amounts to numbers in the result", async () => {
    const dueSoon = new Date()
    dueSoon.setDate(dueSoon.getDate() + 3)

    mockRecurringBillFindMany.mockResolvedValue([
      makeRecurringBill({ amount: decimal(250.5), nextDueDate: dueSoon }),
    ] as never)

    const bills = await getUpcomingBills(30)

    expect(typeof bills[0].amount).toBe("number")
    expect(bills[0].amount).toBe(250.5)
  })

  it("includes account info in results", async () => {
    const dueSoon = new Date()
    dueSoon.setDate(dueSoon.getDate() + 2)

    mockRecurringBillFindMany.mockResolvedValue([
      makeRecurringBill({ nextDueDate: dueSoon }),
    ] as never)

    const bills = await getUpcomingBills(30)

    expect(bills[0].account).toEqual({ id: "acc-1", name: "Checking" })
  })
})

// ── confirmVariableBill ───────────────────────────────────────────────────────

describe("confirmVariableBill", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(confirmVariableBill("txn-1", 95)).rejects.toThrow("Unauthorized")
  })

  it("throws 'Transaction not found' for non-existent transaction", async () => {
    mockTransactionFindFirst.mockResolvedValue(null as never)
    await expect(confirmVariableBill("nonexistent", 95)).rejects.toThrow("Transaction not found")
  })

  it("throws 'Transaction is not pending confirmation' when notes is not PENDING_CONFIRMATION", async () => {
    mockTransactionFindFirst.mockResolvedValue(
      makePendingTransaction({ notes: "some other note" }) as never
    )
    await expect(confirmVariableBill("txn-1", 95)).rejects.toThrow(
      "Transaction is not pending confirmation"
    )
  })

  it("throws 'Transaction is not pending confirmation' when notes is null", async () => {
    mockTransactionFindFirst.mockResolvedValue(
      makePendingTransaction({ notes: null }) as never
    )
    await expect(confirmVariableBill("txn-1", 95)).rejects.toThrow(
      "Transaction is not pending confirmation"
    )
  })

  it("updates transaction amount as a negative expense", async () => {
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction({ amount: decimal(-80) }) as never)

    await confirmVariableBill("txn-1", 95)

    expect(mockTx.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "txn-1" },
        data: expect.objectContaining({
          amount: -95,
          notes: null,
        }),
      })
    )
  })

  it("stores the actual amount as negative regardless of positive input", async () => {
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction({ amount: decimal(-80) }) as never)

    await confirmVariableBill("txn-1", 100)

    const call = mockTx.transaction.update.mock.calls[0][0] as { data: { amount: number } }
    expect(call.data.amount).toBe(-100)
  })

  it("clears the PENDING_CONFIRMATION flag by setting notes to null", async () => {
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction() as never)

    await confirmVariableBill("txn-1", 95)

    const call = mockTx.transaction.update.mock.calls[0][0] as { data: { notes: unknown } }
    expect(call.data.notes).toBeNull()
  })

  it("adjusts account balance by the difference when amount changes", async () => {
    // Old amount: -80, new amount: -95, difference: -15
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction({ amount: decimal(-80) }) as never)

    await confirmVariableBill("txn-1", 95)

    expect(mockTx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-1" },
        data: {
          balance: { increment: -15 },
        },
      })
    )
  })

  it("adjusts account balance by positive difference when new amount is less than old", async () => {
    // Old amount: -100, new amount: -60, difference: +40
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction({ amount: decimal(-100) }) as never)

    await confirmVariableBill("txn-1", 60)

    expect(mockTx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc-1" },
        data: {
          balance: { increment: 40 },
        },
      })
    )
  })

  it("skips account balance update when amount is unchanged", async () => {
    // Old amount: -95, new amount: -95, difference: 0
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction({ amount: decimal(-95) }) as never)

    await confirmVariableBill("txn-1", 95)

    expect(mockTx.account.update).not.toHaveBeenCalled()
  })

  it("uses Prisma $transaction for atomicity", async () => {
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction() as never)

    await confirmVariableBill("txn-1", 95)

    expect(mock$Transaction).toHaveBeenCalledOnce()
  })

  it("returns { success: true } on confirmation", async () => {
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction() as never)

    const result = await confirmVariableBill("txn-1", 95)

    expect(result).toEqual({ success: true })
  })

  it("scopes transaction lookup by userId", async () => {
    mockTransactionFindFirst.mockResolvedValue(makePendingTransaction() as never)
    await confirmVariableBill("txn-1", 95)

    expect(mockTransactionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "txn-1", userId: "user-1" }),
      })
    )
  })
})
