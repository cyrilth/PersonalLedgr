"use server"

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { SPENDING_TYPES, INCOME_TYPES } from "@/lib/constants"
import { computeNetWorth, computeUtilization } from "@/lib/calculations"
import { getTithingSettings } from "@/actions/settings"

// ── Account count (for empty-state detection) ───────────────────────

export async function getAccountCount(): Promise<number> {
  const userId = await requireUserId()
  return prisma.account.count({ where: { userId } })
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the authenticated user's ID from the session cookie.
 * Every dashboard action calls this first to scope queries to the current user.
 * Throws if no valid session exists (proxy should prevent this, but defense-in-depth).
 */
async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

/**
 * Convert Prisma Decimal to a plain JS number.
 * Prisma 7 returns Decimal objects for `@db.Decimal` fields — these need
 * conversion before serialization across the server action boundary.
 */
function toNumber(d: unknown): number {
  return Number(d)
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Returns the user's current net worth broken down by assets and liabilities,
 * plus the change from last month.
 *
 * - Assets = CHECKING + SAVINGS balances
 * - Liabilities = CREDIT_CARD + LOAN + MORTGAGE balances (stored as negative)
 * - Month-over-month change is derived by reversing the current month's
 *   transaction deltas from the stored balances.
 */
export async function getNetWorth(year: number) {
  const userId = await requireUserId()

  // Fetch all active account balances (these are stored/snapshotted values)
  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
    select: { balance: true, type: true },
  })

  const { assets, liabilities, netWorth } = computeNetWorth(
    accounts.map((a) => ({ balance: toNumber(a.balance), type: a.type }))
  )

  // To estimate last month's net worth, sum all transaction amounts in the
  // current month and subtract from current totals (reversing the delta).
  const now = new Date()
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const currentMonthTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startOfCurrentMonth },
      account: { isActive: true },
    },
    select: { amount: true, type: true, account: { select: { type: true } } },
  })

  let monthDelta = 0
  for (const t of currentMonthTransactions) {
    monthDelta += toNumber(t.amount)
  }

  const previousNetWorth = netWorth - monthDelta

  return {
    netWorth,
    assets,
    liabilities,
    previousNetWorth,
    change: netWorth - previousNetWorth,
  }
}

/**
 * Returns monthly income and expense totals for the trailing 12 months
 * ending at the current month.
 *
 * Only counts "real" income and spending per the core architecture principle:
 * - Income: INCOME, INTEREST_EARNED
 * - Spending: EXPENSE, LOAN_INTEREST, INTEREST_CHARGED
 * - Transfers are always excluded (they're just money moving between accounts)
 *
 * Returns an array of 12 objects sorted chronologically:
 * [{ month: "2025-04", income: 5000, expense: 3200 }, ...]
 */
export async function getMonthlyIncomeExpense() {
  const userId = await requireUserId()

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed

  // Go back 11 months from current month to get 12 months total
  const startDate = new Date(currentYear, currentMonth - 11, 1)
  const endDate = new Date(currentYear, currentMonth + 1, 1)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startDate, lt: endDate },
      type: {
        in: [...INCOME_TYPES, ...SPENDING_TYPES] as Array<
          "INCOME" | "EXPENSE" | "TRANSFER" | "LOAN_PRINCIPAL" | "LOAN_INTEREST" | "INTEREST_EARNED" | "INTEREST_CHARGED"
        >,
      },
      category: { not: "Opening Balance" },
      account: { isActive: true },
    },
    select: { date: true, amount: true, type: true },
    orderBy: { date: "asc" },
  })

  // Pre-populate all 12 trailing months
  const months: Record<
    string,
    { month: string; income: number; expense: number }
  > = {}

  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentYear, currentMonth - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    months[key] = { month: key, income: 0, expense: 0 }
  }

  // Bucket each transaction into its month, using absolute values
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
 * Returns spending grouped by category for a specific month.
 *
 * Only includes spending transaction types (EXPENSE, LOAN_INTEREST, INTEREST_CHARGED).
 * Uses absolute values so all amounts are positive for chart display.
 * Transactions with no category are grouped under "Uncategorized".
 *
 * Returns sorted descending by amount: [{ category: "Groceries", amount: 450 }, ...]
 */
export async function getSpendingByCategory(year: number, month: number) {
  const userId = await requireUserId()

  // month param is 1-indexed (Jan=1), Date constructor is 0-indexed
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 1)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startDate, lt: endDate },
      type: {
        in: SPENDING_TYPES as Array<
          "INCOME" | "EXPENSE" | "TRANSFER" | "LOAN_PRINCIPAL" | "LOAN_INTEREST" | "INTEREST_EARNED" | "INTEREST_CHARGED"
        >,
      },
      category: { not: "Opening Balance" },
      account: { isActive: true },
    },
    select: { category: true, amount: true },
  })

  // Aggregate spending by category
  const categoryTotals: Record<string, number> = {}

  for (const t of transactions) {
    const cat = t.category || "Uncategorized"
    const amount = Math.abs(toNumber(t.amount))
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amount
  }

  return Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * Returns credit utilization data for each active credit card.
 *
 * CC balances are stored as negative (money owed), so we use Math.abs for display.
 * Utilization = (|balance| / creditLimit) * 100, rounded to 2 decimal places.
 * Includes owner name for household member display.
 */
export async function getCreditUtilization() {
  const userId = await requireUserId()

  const creditCards = await prisma.account.findMany({
    where: { userId, type: "CREDIT_CARD", isActive: true },
    select: {
      id: true,
      name: true,
      balance: true,
      creditLimit: true,
      owner: true,
    },
  })

  return creditCards.map((cc) => {
    const balance = Math.abs(toNumber(cc.balance))
    const limit = toNumber(cc.creditLimit ?? 0)

    return {
      id: cc.id,
      name: cc.name,
      balance,
      limit,
      utilization: computeUtilization(balance, limit),
      owner: cc.owner,
    }
  })
}

/**
 * Returns the next N upcoming recurring bills, ordered by due date.
 *
 * Includes a calculated `daysUntilDue` field (negative = overdue).
 * Variable-amount bills are flagged so the UI can show "(estimated)" badge.
 */
export async function getUpcomingBills(count: number = 10) {
  const userId = await requireUserId()

  const bills = await prisma.recurringBill.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      dayOfMonth: true,
      isVariableAmount: true,
      nextDueDate: true,
      account: { select: { id: true, name: true } },
    },
    orderBy: { nextDueDate: "asc" },
    take: count,
  })

  const now = new Date()

  return bills.map((b) => {
    const dueDate = new Date(b.nextDueDate)
    const diffTime = dueDate.getTime() - now.getTime()
    const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return {
      id: b.id,
      name: b.name,
      amount: toNumber(b.amount),
      frequency: b.frequency,
      isVariableAmount: b.isVariableAmount,
      nextDueDate: b.nextDueDate,
      daysUntilDue,
      account: b.account,
    }
  })
}

/**
 * Returns the most recent N transactions across all accounts.
 *
 * Includes account name for display context. Ordered newest-first.
 * Amounts are converted from Prisma Decimal to plain numbers.
 */
export async function getRecentTransactions(count: number = 10) {
  const userId = await requireUserId()

  const transactions = await prisma.transaction.findMany({
    where: { userId, account: { isActive: true } },
    select: {
      id: true,
      date: true,
      description: true,
      amount: true,
      type: true,
      category: true,
      account: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: count,
  })

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: toNumber(t.amount),
    type: t.type,
    category: t.category,
    account: t.account,
  }))
}

/**
 * Returns month-by-month tithing data for the given year.
 *
 * For each month, computes:
 * - estimated = (monthlyIncome * percentage/100) + extraMonthly
 * - actual = sum of spending transactions matching the tithe category
 *
 * Returns null if tithing is not enabled.
 */
export async function getTithingData(year: number) {
  const userId = await requireUserId()
  const settings = await getTithingSettings()

  if (!settings.tithingEnabled) return null

  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year + 1, 0, 1)

  // Fetch income transactions for the year
  const incomeTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startDate, lt: endDate },
      type: {
        in: INCOME_TYPES as Array<
          "INCOME" | "EXPENSE" | "TRANSFER" | "LOAN_PRINCIPAL" | "LOAN_INTEREST" | "INTEREST_EARNED" | "INTEREST_CHARGED"
        >,
      },
      category: { not: "Opening Balance" },
      account: { isActive: true },
    },
    select: { date: true, amount: true },
  })

  // Fetch actual tithe payments (spending transactions matching the category)
  const titheTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startDate, lt: endDate },
      category: settings.tithingCategory,
      type: {
        in: SPENDING_TYPES as Array<
          "INCOME" | "EXPENSE" | "TRANSFER" | "LOAN_PRINCIPAL" | "LOAN_INTEREST" | "INTEREST_EARNED" | "INTEREST_CHARGED"
        >,
      },
      account: { isActive: true },
    },
    select: { date: true, amount: true },
  })

  // Pre-populate all 12 months
  const months: Record<string, { month: string; income: number; estimated: number; actual: number }> = {}
  for (let m = 0; m < 12; m++) {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`
    months[key] = { month: key, income: 0, estimated: 0, actual: 0 }
  }

  // Bucket income by month
  for (const t of incomeTransactions) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (months[key]) {
      months[key].income += Math.abs(toNumber(t.amount))
    }
  }

  // Bucket actual tithe payments by month
  for (const t of titheTransactions) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (months[key]) {
      months[key].actual += Math.abs(toNumber(t.amount))
    }
  }

  // Compute estimated tithe for each month
  const percentage = settings.tithingPercentage
  const extra = settings.tithingExtraMonthly
  let ytdEstimated = 0
  let ytdActual = 0

  const monthArray = Object.values(months)
  for (const m of monthArray) {
    m.estimated = Math.round(((m.income * percentage) / 100 + extra) * 100) / 100
    m.actual = Math.round(m.actual * 100) / 100
    ytdEstimated += m.estimated
    ytdActual += m.actual
  }

  return {
    months: monthArray,
    ytdEstimated: Math.round(ytdEstimated * 100) / 100,
    ytdActual: Math.round(ytdActual * 100) / 100,
    settings,
  }
}

/**
 * Returns the net change in account balances for each month of the given year.
 *
 * Sums ALL transaction amounts per month (including transfers, which net to zero
 * across accounts). Useful for tracking whether the user's total wealth grew
 * or shrank each month.
 *
 * Returns: [{ month: "2026-01", netChange: 1250.00 }, ...]
 */
export async function getMonthOverMonthChange(year: number) {
  const userId = await requireUserId()

  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year + 1, 0, 1)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: startDate, lt: endDate },
      account: { isActive: true },
    },
    select: { date: true, amount: true },
    orderBy: { date: "asc" },
  })

  // Pre-populate all 12 months
  const months: Record<string, number> = {}
  for (let m = 0; m < 12; m++) {
    const key = `${year}-${String(m + 1).padStart(2, "0")}`
    months[key] = 0
  }

  // Sum transaction amounts into monthly buckets
  for (const t of transactions) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (months[key] !== undefined) {
      months[key] += toNumber(t.amount)
    }
  }

  return Object.entries(months).map(([month, netChange]) => ({
    month,
    netChange,
  }))
}

/**
 * Returns an interest summary for the dashboard: total interest charged (paid)
 * and earned for the current month and year-to-date, plus the net interest.
 *
 * Queries the InterestLog table, grouping by type (CHARGED vs EARNED) and
 * filtering by date ranges. All amounts are returned as positive numbers —
 * "charged" means cost to the user, "earned" means income from savings.
 *
 * @returns Object with thisMonth and thisYear breakdowns, plus net (earned - charged)
 */
export async function getInterestSummary() {
  const userId = await requireUserId()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfYear = new Date(now.getFullYear(), 0, 1)

  // Fetch all interest logs for the current year
  const logs = await prisma.interestLog.findMany({
    where: {
      userId,
      date: { gte: startOfYear },
      account: { isActive: true },
    },
    select: { date: true, amount: true, type: true },
  })

  let monthCharged = 0
  let monthEarned = 0
  let yearCharged = 0
  let yearEarned = 0

  for (const log of logs) {
    const amount = Math.abs(toNumber(log.amount))
    const logDate = new Date(log.date)

    if (log.type === "CHARGED") {
      yearCharged += amount
      if (logDate >= startOfMonth) monthCharged += amount
    } else {
      yearEarned += amount
      if (logDate >= startOfMonth) monthEarned += amount
    }
  }

  // Round to cents
  const round = (n: number) => Math.round(n * 100) / 100

  return {
    thisMonth: {
      charged: round(monthCharged),
      earned: round(monthEarned),
      net: round(monthEarned - monthCharged),
    },
    thisYear: {
      charged: round(yearCharged),
      earned: round(yearEarned),
      net: round(yearEarned - yearCharged),
    },
  }
}
