"use server"

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { SPENDING_TYPES, INCOME_TYPES } from "@/lib/constants"

// ── Helpers ──────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

function toNumber(d: unknown): number {
  return Number(d)
}

// Type alias used for Prisma transaction type filter
type TxType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "LOAN_PRINCIPAL"
  | "LOAN_INTEREST"
  | "INTEREST_EARNED"
  | "INTEREST_CHARGED"

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Returns category running totals for spending and income in the given date range.
 * Each category row has: totalSpending, totalIncome, transactionCount.
 * Also returns period-level totals.
 */
export async function getCategoryRunningTotals(startDate: string, endDate: string) {
  const userId = await requireUserId()

  const start = new Date(startDate)
  const end = new Date(endDate)
  end.setDate(end.getDate() + 1) // inclusive end date

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      type: { in: [...INCOME_TYPES, ...SPENDING_TYPES] as TxType[] },
      account: { isActive: true },
    },
    select: { category: true, amount: true, type: true },
  })

  const categories: Record<string, { spending: number; income: number; count: number }> = {}

  let totalIncome = 0
  let totalSpending = 0
  let totalCount = 0

  for (const t of transactions) {
    const cat = t.category || "Uncategorized"
    if (!categories[cat]) categories[cat] = { spending: 0, income: 0, count: 0 }

    const amount = Math.abs(toNumber(t.amount))
    categories[cat].count++
    totalCount++

    if ((INCOME_TYPES as readonly string[]).includes(t.type)) {
      categories[cat].income += amount
      totalIncome += amount
    } else if ((SPENDING_TYPES as readonly string[]).includes(t.type)) {
      categories[cat].spending += amount
      totalSpending += amount
    }
  }

  const rows = Object.entries(categories)
    .map(([category, data]) => ({
      category,
      totalSpending: Math.round(data.spending * 100) / 100,
      totalIncome: Math.round(data.income * 100) / 100,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.totalSpending - a.totalSpending)

  return {
    categories: rows,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalSpending: Math.round(totalSpending * 100) / 100,
    net: Math.round((totalIncome - totalSpending) * 100) / 100,
    totalCount,
  }
}

/**
 * Returns monthly income vs expense totals for an arbitrary date range.
 * Dynamically generates month buckets spanning the range.
 */
export async function getIncomeVsExpenseByMonth(startDate: string, endDate: string) {
  const userId = await requireUserId()

  const start = new Date(startDate)
  const end = new Date(endDate)
  end.setDate(end.getDate() + 1)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      type: { in: [...INCOME_TYPES, ...SPENDING_TYPES] as TxType[] },
      account: { isActive: true },
    },
    select: { date: true, amount: true, type: true },
    orderBy: { date: "asc" },
  })

  // Build month buckets spanning the date range
  const months: Record<string, { month: string; income: number; expense: number }> = {}
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)

  while (cursor <= endMonth) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
    months[key] = { month: key, income: 0, expense: 0 }
    cursor.setMonth(cursor.getMonth() + 1)
  }

  for (const t of transactions) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (!months[key]) continue

    const amount = Math.abs(toNumber(t.amount))

    if ((INCOME_TYPES as readonly string[]).includes(t.type)) {
      months[key].income += amount
    } else if ((SPENDING_TYPES as readonly string[]).includes(t.type)) {
      months[key].expense += amount
    }
  }

  return Object.values(months)
}

/**
 * Returns spending grouped by category for each month in the date range.
 * Used for stacked category trend analysis.
 */
export async function getSpendingByCategoryByMonth(startDate: string, endDate: string) {
  const userId = await requireUserId()

  const start = new Date(startDate)
  const end = new Date(endDate)
  end.setDate(end.getDate() + 1)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      type: { in: SPENDING_TYPES as TxType[] },
      account: { isActive: true },
    },
    select: { date: true, amount: true, category: true },
    orderBy: { date: "asc" },
  })

  // Build month buckets
  const months: Record<string, { month: string; categories: Record<string, number> }> = {}
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)

  while (cursor <= endMonth) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`
    months[key] = { month: key, categories: {} }
    cursor.setMonth(cursor.getMonth() + 1)
  }

  for (const t of transactions) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (!months[key]) continue

    const cat = t.category || "Uncategorized"
    const amount = Math.abs(toNumber(t.amount))
    months[key].categories[cat] = (months[key].categories[cat] || 0) + amount
  }

  return Object.values(months)
}

/**
 * Returns income grouped by category within the date range.
 * Sorted descending by amount.
 */
export async function getIncomeByCategory(startDate: string, endDate: string) {
  const userId = await requireUserId()

  const start = new Date(startDate)
  const end = new Date(endDate)
  end.setDate(end.getDate() + 1)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
      type: { in: INCOME_TYPES as TxType[] },
      account: { isActive: true },
    },
    select: { category: true, amount: true },
  })

  const categoryTotals: Record<string, number> = {}

  for (const t of transactions) {
    const cat = t.category || "Uncategorized"
    const amount = Math.abs(toNumber(t.amount))
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amount
  }

  return Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount)
}
