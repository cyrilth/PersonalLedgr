"use server"

/**
 * Server actions for budget management.
 *
 * Budgets track spending limits by category for a given month period.
 * Each budget entry has a category, a period (YYYY-MM string), and a limit.
 * The unique constraint [userId, category, period] prevents duplicate budget
 * entries for the same category in the same month.
 *
 * Key patterns:
 * - Period format: "YYYY-MM" (e.g., "2026-02")
 * - Actual spending computed by summing SPENDING_TYPES transactions for the period
 * - Prisma Decimal → toNumber() before returning across the server action boundary
 * - copyBudgets clones budget entries from one period to another
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { SPENDING_TYPES } from "@/lib/constants"

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the authenticated user's ID from the session cookie.
 * Throws if no valid session exists.
 */
async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

/**
 * Convert Prisma Decimal to a plain JS number.
 */
function toNumber(d: unknown): number {
  return Number(d)
}

/**
 * Parse a "YYYY-MM" period string into start/end Date objects for query filtering.
 * Returns [startDate, endDate) where endDate is the first day of the next month.
 */
function periodToDateRange(period: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = period.split("-")
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10) - 1 // 0-indexed
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1),
  }
}

// ── Types ────────────────────────────────────────────────────────────

/** Budget entry with the spending limit for display. */
export interface BudgetEntry {
  id: string
  category: string
  period: string
  limit: number
}

/** Budget vs actual comparison for a single category. */
export interface BudgetVsActual {
  id: string
  category: string
  period: string
  limit: number
  actual: number
  remaining: number
  percentUsed: number
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Returns all budgets for a given period with their spending limits.
 *
 * @param period - Month string in "YYYY-MM" format
 * @returns Array of budget entries sorted by category
 */
export async function getBudgets(period: string): Promise<BudgetEntry[]> {
  const userId = await requireUserId()

  const budgets = await prisma.budget.findMany({
    where: { userId, period },
    orderBy: { category: "asc" },
  })

  return budgets.map((b) => ({
    id: b.id,
    category: b.category,
    period: b.period,
    limit: toNumber(b.limit),
  }))
}

/**
 * Creates a new budget entry for a category and period.
 *
 * The unique constraint [userId, category, period] prevents duplicates.
 * If a budget already exists for the same category and period, Prisma will
 * throw a unique constraint violation.
 *
 * @throws "Category is required" | "Limit must be positive" | "Period is required"
 */
export async function createBudget(data: {
  category: string
  period: string
  limit: number
}) {
  const userId = await requireUserId()

  if (!data.category?.trim()) throw new Error("Category is required")
  if (data.limit <= 0) throw new Error("Limit must be positive")
  if (!data.period?.match(/^\d{4}-\d{2}$/)) throw new Error("Period is required")

  const budget = await prisma.budget.create({
    data: {
      category: data.category.trim(),
      period: data.period,
      limit: data.limit,
      userId,
    },
  })

  return { id: budget.id }
}

/**
 * Updates a budget's spending limit.
 *
 * Verifies user ownership before updating.
 *
 * @throws "Budget not found" if the budget doesn't exist or doesn't belong to the current user
 * @throws "Limit must be positive" if the new limit is zero or negative
 */
export async function updateBudget(id: string, data: { limit?: number; category?: string }) {
  const userId = await requireUserId()

  const budget = await prisma.budget.findFirst({
    where: { id, userId },
  })
  if (!budget) throw new Error("Budget not found")

  const update: Record<string, unknown> = {}
  if (data.limit !== undefined) {
    if (data.limit <= 0) throw new Error("Limit must be positive")
    update.limit = data.limit
  }
  if (data.category !== undefined) update.category = data.category.trim()

  await prisma.budget.update({
    where: { id },
    data: update,
  })

  return { success: true }
}

/**
 * Deletes a budget entry permanently.
 *
 * Unlike accounts/bills which use soft delete, budgets are simple enough
 * to hard-delete since they have no transaction history.
 *
 * @throws "Budget not found" if the budget doesn't exist or doesn't belong to the current user
 */
export async function deleteBudget(id: string) {
  const userId = await requireUserId()

  const budget = await prisma.budget.findFirst({
    where: { id, userId },
  })
  if (!budget) throw new Error("Budget not found")

  await prisma.budget.delete({
    where: { id },
  })

  return { success: true }
}

/**
 * Returns budget vs actual spending for each budget category in a period.
 *
 * For each budget entry, sums the actual spending from SPENDING_TYPES transactions
 * (EXPENSE, LOAN_INTEREST, INTEREST_CHARGED) in the same category and period.
 * Returns the limit, actual amount, remaining amount, and percent used.
 *
 * @param period - Month string in "YYYY-MM" format
 */
export async function getBudgetVsActual(period: string): Promise<BudgetVsActual[]> {
  const userId = await requireUserId()
  const { start, end } = periodToDateRange(period)

  // Fetch all budgets for this period
  const budgets = await prisma.budget.findMany({
    where: { userId, period },
    orderBy: { category: "asc" },
  })

  if (budgets.length === 0) return []

  // Fetch all spending transactions for the period in one query
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      type: {
        in: SPENDING_TYPES as Array<
          "INCOME" | "EXPENSE" | "TRANSFER" | "LOAN_PRINCIPAL" | "LOAN_INTEREST" | "INTEREST_EARNED" | "INTEREST_CHARGED"
        >,
      },
      account: { isActive: true },
    },
    select: { category: true, amount: true },
  })

  // Aggregate spending by category
  const spendingByCategory: Record<string, number> = {}
  for (const t of transactions) {
    const cat = t.category || "Uncategorized"
    spendingByCategory[cat] = (spendingByCategory[cat] || 0) + Math.abs(toNumber(t.amount))
  }

  // Combine budgets with actual spending
  return budgets.map((b) => {
    const limit = toNumber(b.limit)
    const actual = Math.round((spendingByCategory[b.category] || 0) * 100) / 100
    const remaining = Math.round((limit - actual) * 100) / 100
    const percentUsed = limit > 0 ? Math.round((actual / limit) * 10000) / 100 : 0

    return {
      id: b.id,
      category: b.category,
      period: b.period,
      limit,
      actual,
      remaining,
      percentUsed,
    }
  })
}

/**
 * Copies all budget entries from one period to another.
 *
 * Creates new budget entries in the target period with the same categories
 * and limits as the source period. Skips categories that already exist in
 * the target period (due to the unique constraint).
 *
 * @param fromPeriod - Source period "YYYY-MM"
 * @param toPeriod - Target period "YYYY-MM"
 * @returns Number of budgets copied
 * @throws "Source period has no budgets" if no budgets exist in the source period
 */
export async function copyBudgets(fromPeriod: string, toPeriod: string) {
  const userId = await requireUserId()

  const sourceBudgets = await prisma.budget.findMany({
    where: { userId, period: fromPeriod },
  })

  if (sourceBudgets.length === 0) throw new Error("Source period has no budgets")

  // Check which categories already exist in the target period
  const existingBudgets = await prisma.budget.findMany({
    where: { userId, period: toPeriod },
    select: { category: true },
  })
  const existingCategories = new Set(existingBudgets.map((b) => b.category))

  // Filter to only new categories
  const toCopy = sourceBudgets.filter((b) => !existingCategories.has(b.category))

  if (toCopy.length === 0) return { copied: 0 }

  // Bulk create
  await prisma.budget.createMany({
    data: toCopy.map((b) => ({
      category: b.category,
      period: toPeriod,
      limit: b.limit,
      userId,
    })),
  })

  return { copied: toCopy.length }
}
