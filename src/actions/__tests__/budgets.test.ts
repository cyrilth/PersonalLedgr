/**
 * Unit tests for src/actions/budgets.ts — Budget server actions.
 *
 * Mocking strategy:
 * - next/headers, @/lib/auth, and @/db are vi.mock'd before any imports
 * - No $transaction needed here — budget actions use simple CRUD operations
 * - Prisma Decimal values are mocked as objects with a valueOf that coerces to number
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

vi.mock("@/db", () => ({
  prisma: {
    budget: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      createMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { auth } from "@/lib/auth"
import { prisma } from "@/db"
import {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  getBudgetVsActual,
  copyBudgets,
} from "../budgets"

// ── Typed mock accessors ──────────────────────────────────────────────────────

const mockGetSession = vi.mocked(auth.api.getSession)
const mockBudgetFindMany = vi.mocked(prisma.budget.findMany)
const mockBudgetFindFirst = vi.mocked(prisma.budget.findFirst)
const mockBudgetCreate = vi.mocked(prisma.budget.create)
const mockBudgetUpdate = vi.mocked(prisma.budget.update)
const mockBudgetDelete = vi.mocked(prisma.budget.delete)
const mockBudgetCreateMany = vi.mocked(prisma.budget.createMany)
const mockTransactionFindMany = vi.mocked(prisma.transaction.findMany)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a minimal session object for the auth mock. */
function makeSession(userId = "user-1") {
  return { user: { id: userId } }
}

/**
 * Simulates a Prisma Decimal value.
 * The source uses Number(d) so returning a plain number works fine,
 * but wrapping lets tests be explicit about what the DB returns.
 */
function decimal(n: number) {
  return n
}

/**
 * Factory for a mock Budget record as Prisma would return it.
 * Defaults to a Groceries budget for 2026-02.
 */
function makeBudget(overrides: Record<string, unknown> = {}) {
  return {
    id: "budget-1",
    category: "Groceries",
    period: "2026-02",
    limit: decimal(500),
    userId: "user-1",
    ...overrides,
  }
}

/**
 * Factory for a mock spending Transaction as Prisma would return it
 * (select: { category, amount } shape used in getBudgetVsActual).
 */
function makeSpendingTxn(category: string, amount: number) {
  return { category, amount: decimal(amount) }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSession.mockResolvedValue(makeSession() as never)
})

// ── getBudgets ────────────────────────────────────────────────────────────────

describe("getBudgets", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getBudgets("2026-02")).rejects.toThrow("Unauthorized")
  })

  it("returns empty array when no budgets exist for the period", async () => {
    mockBudgetFindMany.mockResolvedValue([] as never)
    const result = await getBudgets("2026-02")
    expect(result).toEqual([])
  })

  it("returns mapped budget entries with Decimal-to-number conversion", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget()] as never)

    const result = await getBudgets("2026-02")

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: "budget-1",
      category: "Groceries",
      period: "2026-02",
      limit: 500,
    })
  })

  it("returns limit as a plain JS number", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ limit: decimal(199.99) })] as never)

    const result = await getBudgets("2026-02")

    expect(typeof result[0].limit).toBe("number")
    expect(result[0].limit).toBe(199.99)
  })

  it("queries with correct userId and period", async () => {
    mockBudgetFindMany.mockResolvedValue([] as never)

    await getBudgets("2026-03")

    expect(mockBudgetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", period: "2026-03" },
      })
    )
  })

  it("returns multiple budgets in the order returned by the DB", async () => {
    mockBudgetFindMany.mockResolvedValue([
      makeBudget({ id: "budget-1", category: "Dining" }),
      makeBudget({ id: "budget-2", category: "Groceries" }),
    ] as never)

    const result = await getBudgets("2026-02")

    expect(result).toHaveLength(2)
    expect(result[0].category).toBe("Dining")
    expect(result[1].category).toBe("Groceries")
  })
})

// ── createBudget ──────────────────────────────────────────────────────────────

describe("createBudget", () => {
  const validData = {
    category: "Groceries",
    period: "2026-02",
    limit: 500,
  }

  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(createBudget(validData)).rejects.toThrow("Unauthorized")
  })

  it("throws 'Category is required' for empty string", async () => {
    await expect(createBudget({ ...validData, category: "" })).rejects.toThrow("Category is required")
  })

  it("throws 'Category is required' for whitespace-only string", async () => {
    await expect(createBudget({ ...validData, category: "   " })).rejects.toThrow("Category is required")
  })

  it("throws 'Limit must be positive' for zero limit", async () => {
    await expect(createBudget({ ...validData, limit: 0 })).rejects.toThrow("Limit must be positive")
  })

  it("throws 'Limit must be positive' for negative limit", async () => {
    await expect(createBudget({ ...validData, limit: -100 })).rejects.toThrow("Limit must be positive")
  })

  it("throws 'Period is required' for empty period string", async () => {
    await expect(createBudget({ ...validData, period: "" })).rejects.toThrow("Period is required")
  })

  it("throws 'Period is required' for invalid period format (no dash)", async () => {
    await expect(createBudget({ ...validData, period: "202602" })).rejects.toThrow("Period is required")
  })

  it("throws 'Period is required' for invalid period format (wrong pattern)", async () => {
    await expect(createBudget({ ...validData, period: "02-2026" })).rejects.toThrow("Period is required")
  })

  it("creates a budget and returns its id", async () => {
    mockBudgetCreate.mockResolvedValue({ id: "budget-new" } as never)

    const result = await createBudget(validData)

    expect(result).toEqual({ id: "budget-new" })
    expect(mockBudgetCreate).toHaveBeenCalledOnce()
  })

  it("creates budget with correct data including userId", async () => {
    mockBudgetCreate.mockResolvedValue({ id: "budget-new" } as never)

    await createBudget(validData)

    expect(mockBudgetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          category: "Groceries",
          period: "2026-02",
          limit: 500,
          userId: "user-1",
        }),
      })
    )
  })

  it("trims whitespace from category name before saving", async () => {
    mockBudgetCreate.mockResolvedValue({ id: "budget-new" } as never)

    await createBudget({ ...validData, category: "  Groceries  " })

    expect(mockBudgetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ category: "Groceries" }),
      })
    )
  })

  it("accepts a valid YYYY-MM period format", async () => {
    mockBudgetCreate.mockResolvedValue({ id: "budget-new" } as never)

    await expect(createBudget({ ...validData, period: "2025-12" })).resolves.not.toThrow()
  })
})

// ── updateBudget ──────────────────────────────────────────────────────────────

describe("updateBudget", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(updateBudget("budget-1", { limit: 600 })).rejects.toThrow("Unauthorized")
  })

  it("throws 'Budget not found' for non-existent budget", async () => {
    mockBudgetFindFirst.mockResolvedValue(null as never)
    await expect(updateBudget("nonexistent", { limit: 600 })).rejects.toThrow("Budget not found")
  })

  it("throws 'Budget not found' when budget belongs to a different user", async () => {
    mockBudgetFindFirst.mockResolvedValue(null as never)
    await expect(updateBudget("budget-1", { limit: 600 })).rejects.toThrow("Budget not found")
  })

  it("throws 'Limit must be positive' for zero limit", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)
    await expect(updateBudget("budget-1", { limit: 0 })).rejects.toThrow("Limit must be positive")
  })

  it("throws 'Limit must be positive' for negative limit", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)
    await expect(updateBudget("budget-1", { limit: -50 })).rejects.toThrow("Limit must be positive")
  })

  it("updates the limit when provided", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    await updateBudget("budget-1", { limit: 750 })

    expect(mockBudgetUpdate).toHaveBeenCalledWith({
      where: { id: "budget-1" },
      data: { limit: 750 },
    })
  })

  it("updates the category when provided", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    await updateBudget("budget-1", { category: "Dining" })

    expect(mockBudgetUpdate).toHaveBeenCalledWith({
      where: { id: "budget-1" },
      data: { category: "Dining" },
    })
  })

  it("trims category whitespace on update", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    await updateBudget("budget-1", { category: "  Dining  " })

    expect(mockBudgetUpdate).toHaveBeenCalledWith({
      where: { id: "budget-1" },
      data: { category: "Dining" },
    })
  })

  it("updates both limit and category when both are provided", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    await updateBudget("budget-1", { limit: 600, category: "Dining" })

    expect(mockBudgetUpdate).toHaveBeenCalledWith({
      where: { id: "budget-1" },
      data: { limit: 600, category: "Dining" },
    })
  })

  it("scopes the lookup query by userId", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    await updateBudget("budget-1", { limit: 600 })

    expect(mockBudgetFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "budget-1", userId: "user-1" },
      })
    )
  })

  it("returns { success: true } on successful update", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    const result = await updateBudget("budget-1", { limit: 600 })

    expect(result).toEqual({ success: true })
  })
})

// ── deleteBudget ──────────────────────────────────────────────────────────────

describe("deleteBudget", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(deleteBudget("budget-1")).rejects.toThrow("Unauthorized")
  })

  it("throws 'Budget not found' for non-existent budget", async () => {
    mockBudgetFindFirst.mockResolvedValue(null as never)
    await expect(deleteBudget("nonexistent")).rejects.toThrow("Budget not found")
  })

  it("throws 'Budget not found' when budget belongs to a different user", async () => {
    mockBudgetFindFirst.mockResolvedValue(null as never)
    await expect(deleteBudget("budget-1")).rejects.toThrow("Budget not found")
  })

  it("hard-deletes the budget record", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    await deleteBudget("budget-1")

    expect(mockBudgetDelete).toHaveBeenCalledWith({
      where: { id: "budget-1" },
    })
  })

  it("scopes the lookup query by userId", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    await deleteBudget("budget-1")

    expect(mockBudgetFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "budget-1", userId: "user-1" },
      })
    )
  })

  it("returns { success: true } after deletion", async () => {
    mockBudgetFindFirst.mockResolvedValue(makeBudget() as never)

    const result = await deleteBudget("budget-1")

    expect(result).toEqual({ success: true })
  })
})

// ── getBudgetVsActual ─────────────────────────────────────────────────────────

describe("getBudgetVsActual", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(getBudgetVsActual("2026-02")).rejects.toThrow("Unauthorized")
  })

  it("returns empty array when no budgets exist", async () => {
    mockBudgetFindMany.mockResolvedValue([] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result).toEqual([])
    // Should not query transactions if there are no budgets
    expect(mockTransactionFindMany).not.toHaveBeenCalled()
  })

  it("calculates actual spending from matching transactions", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Groceries", limit: 500 })] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Groceries", -120),
      makeSpendingTxn("Groceries", -80),
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result[0].actual).toBe(200)
  })

  it("computes remaining as limit minus actual", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Groceries", limit: 500 })] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Groceries", -300),
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result[0].remaining).toBe(200)
  })

  it("computes percentUsed correctly", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Groceries", limit: 400 })] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Groceries", -100),
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result[0].percentUsed).toBe(25)
  })

  it("uses absolute values for transaction amounts (handles negative amounts)", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Groceries", limit: 500 })] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Groceries", -250),
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    // 250 (absolute value), not -250
    expect(result[0].actual).toBe(250)
  })

  it("only includes SPENDING_TYPES transactions in the query", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget()] as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getBudgetVsActual("2026-02")

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: expect.objectContaining({
            in: expect.arrayContaining(["EXPENSE", "LOAN_INTEREST", "INTEREST_CHARGED"]),
          }),
        }),
      })
    )
  })

  it("groups spending by category correctly across multiple categories", async () => {
    mockBudgetFindMany.mockResolvedValue([
      makeBudget({ id: "b1", category: "Groceries", limit: 500 }),
      makeBudget({ id: "b2", category: "Dining", limit: 200 }),
    ] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Groceries", -100),
      makeSpendingTxn("Groceries", -50),
      makeSpendingTxn("Dining", -75),
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    const groceries = result.find((r) => r.category === "Groceries")!
    const dining = result.find((r) => r.category === "Dining")!

    expect(groceries.actual).toBe(150)
    expect(dining.actual).toBe(75)
  })

  it("sets actual to 0 for categories with no spending transactions", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Entertainment", limit: 100 })] as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result[0].actual).toBe(0)
    expect(result[0].remaining).toBe(100)
    expect(result[0].percentUsed).toBe(0)
  })

  it("handles over-budget scenario (remaining is negative)", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Dining", limit: 100 })] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Dining", -150),
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result[0].remaining).toBe(-50)
    expect(result[0].percentUsed).toBe(150)
  })

  it("queries transactions scoped to the current user and date range", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget()] as never)
    mockTransactionFindMany.mockResolvedValue([] as never)

    await getBudgetVsActual("2026-02")

    expect(mockTransactionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          date: {
            gte: new Date(2026, 1, 1),   // Feb 1
            lt: new Date(2026, 2, 1),    // Mar 1
          },
        }),
      })
    )
  })

  it("returns full BudgetVsActual shape for each budget", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Groceries", limit: 500 })] as never)
    mockTransactionFindMany.mockResolvedValue([makeSpendingTxn("Groceries", -200)] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result[0]).toMatchObject({
      id: "budget-1",
      category: "Groceries",
      period: "2026-02",
      limit: 500,
      actual: 200,
      remaining: 300,
      percentUsed: 40,
    })
  })

  it("ignores transactions from categories not in any budget", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Groceries", limit: 500 })] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Groceries", -100),
      makeSpendingTxn("Entertainment", -999), // no budget for this category
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    expect(result).toHaveLength(1)
    expect(result[0].actual).toBe(100)
  })

  it("rounds actual and remaining to two decimal places", async () => {
    mockBudgetFindMany.mockResolvedValue([makeBudget({ category: "Groceries", limit: 100 })] as never)
    mockTransactionFindMany.mockResolvedValue([
      makeSpendingTxn("Groceries", -33.333),
      makeSpendingTxn("Groceries", -33.333),
      makeSpendingTxn("Groceries", -33.333),
    ] as never)

    const result = await getBudgetVsActual("2026-02")

    // 3 * 33.333 = 99.999 — should round to 100.00
    expect(result[0].actual).toBe(100)
  })
})

// ── copyBudgets ───────────────────────────────────────────────────────────────

describe("copyBudgets", () => {
  it("throws Unauthorized when no session", async () => {
    mockGetSession.mockResolvedValue(null as never)
    await expect(copyBudgets("2026-01", "2026-02")).rejects.toThrow("Unauthorized")
  })

  it("throws 'Source period has no budgets' when source is empty", async () => {
    // First findMany call returns source budgets (empty)
    mockBudgetFindMany.mockResolvedValue([] as never)

    await expect(copyBudgets("2026-01", "2026-02")).rejects.toThrow("Source period has no budgets")
  })

  it("copies all source budgets when target period is empty", async () => {
    mockBudgetFindMany
      .mockResolvedValueOnce([
        makeBudget({ id: "b1", category: "Groceries", limit: 500 }),
        makeBudget({ id: "b2", category: "Dining", limit: 200 }),
      ] as never)
      .mockResolvedValueOnce([] as never) // existing in target

    await copyBudgets("2026-01", "2026-02")

    expect(mockBudgetCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ category: "Groceries", period: "2026-02", limit: 500, userId: "user-1" }),
        expect.objectContaining({ category: "Dining", period: "2026-02", limit: 200, userId: "user-1" }),
      ]),
    })
  })

  it("skips categories that already exist in the target period", async () => {
    mockBudgetFindMany
      .mockResolvedValueOnce([
        makeBudget({ id: "b1", category: "Groceries", limit: 500 }),
        makeBudget({ id: "b2", category: "Dining", limit: 200 }),
      ] as never)
      .mockResolvedValueOnce([
        { category: "Groceries" }, // already exists in target
      ] as never)

    await copyBudgets("2026-01", "2026-02")

    // Only "Dining" should be copied
    expect(mockBudgetCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ category: "Dining", period: "2026-02" }),
      ],
    })
  })

  it("returns { copied: 0 } when all categories already exist in target", async () => {
    mockBudgetFindMany
      .mockResolvedValueOnce([
        makeBudget({ id: "b1", category: "Groceries", limit: 500 }),
      ] as never)
      .mockResolvedValueOnce([
        { category: "Groceries" }, // already exists
      ] as never)

    const result = await copyBudgets("2026-01", "2026-02")

    expect(result).toEqual({ copied: 0 })
    expect(mockBudgetCreateMany).not.toHaveBeenCalled()
  })

  it("returns the count of newly copied budgets", async () => {
    mockBudgetFindMany
      .mockResolvedValueOnce([
        makeBudget({ id: "b1", category: "Groceries", limit: 500 }),
        makeBudget({ id: "b2", category: "Dining", limit: 200 }),
        makeBudget({ id: "b3", category: "Entertainment", limit: 100 }),
      ] as never)
      .mockResolvedValueOnce([
        { category: "Groceries" }, // already exists
      ] as never)

    const result = await copyBudgets("2026-01", "2026-02")

    expect(result).toEqual({ copied: 2 })
  })

  it("copies budgets with the target period, not the source period", async () => {
    mockBudgetFindMany
      .mockResolvedValueOnce([makeBudget({ category: "Groceries", limit: 500, period: "2026-01" })] as never)
      .mockResolvedValueOnce([] as never)

    await copyBudgets("2026-01", "2026-02")

    expect(mockBudgetCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ period: "2026-02" }),
      ],
    })
  })

  it("queries source budgets scoped by userId", async () => {
    mockBudgetFindMany
      .mockResolvedValueOnce([makeBudget()] as never)
      .mockResolvedValueOnce([] as never)

    await copyBudgets("2026-01", "2026-02")

    expect(mockBudgetFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { userId: "user-1", period: "2026-01" },
      })
    )
  })

  it("queries existing target budgets scoped by userId", async () => {
    mockBudgetFindMany
      .mockResolvedValueOnce([makeBudget()] as never)
      .mockResolvedValueOnce([] as never)

    await copyBudgets("2026-01", "2026-02")

    expect(mockBudgetFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { userId: "user-1", period: "2026-02" },
      })
    )
  })
})
