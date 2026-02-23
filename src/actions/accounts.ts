"use server"

/**
 * Server actions for account CRUD, balance recalculation, and history.
 *
 * Handles all account types (checking, savings, credit card, loan, mortgage)
 * with nested writes for CC details and loan records. Every query is scoped
 * to the authenticated user via requireUserId().
 *
 * Key patterns:
 * - Prisma Decimal → toNumber() before returning across the server action boundary
 * - CC/loan/mortgage balances are stored as negative, displayed with Math.abs()
 * - Soft delete via isActive flag (never hard-delete accounts with transaction history)
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants"
import type { AccountType } from "@/lib/constants"
import {
  computeBalanceHistory,
  groupAccountsByType,
  computeDrift,
} from "@/lib/calculations"

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the authenticated user's ID from the session cookie.
 * Every account action calls this first to scope queries to the current user.
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

// ── Types ────────────────────────────────────────────────────────────

/** A group of accounts sharing the same type, with a display label and balance total. */
interface AccountGroup {
  type: string
  label: string
  accounts: AccountSummary[]
  total: number
}

/** Lightweight account data for list/card display. */
interface AccountSummary {
  id: string
  name: string
  type: string
  balance: number
  creditLimit: number | null
  owner: string | null
  isActive: boolean
}

// ── Server Actions ───────────────────────────────────────────────────

/** Display order for account type groups on the list page. */
const TYPE_ORDER: AccountType[] = ["CHECKING", "SAVINGS", "CREDIT_CARD", "LOAN", "MORTGAGE"]

/**
 * Returns all active accounts grouped by type.
 *
 * Groups are ordered: Checking → Savings → Credit Card → Loan → Mortgage.
 * Each group includes a human-readable label and the sum of its account balances.
 * Only groups with at least one account are returned.
 */
export async function getAccounts(): Promise<AccountGroup[]> {
  const userId = await requireUserId()

  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      balance: true,
      creditLimit: true,
      owner: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  })

  const mapped: AccountSummary[] = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    balance: toNumber(a.balance),
    creditLimit: a.creditLimit ? toNumber(a.creditLimit) : null,
    owner: a.owner,
    isActive: a.isActive,
  }))

  return groupAccountsByType(mapped, TYPE_ORDER, ACCOUNT_TYPE_LABELS)
}

/**
 * Returns a flat list of all active accounts with optional loan info.
 *
 * Used by the transaction form and filter dropdowns which need a simple
 * array rather than grouped data. Loan/mortgage accounts include their
 * interest rate and monthly payment for the loan payment form.
 */
export async function getAccountsFlat() {
  const userId = await requireUserId()

  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
    include: {
      loan: { select: { interestRate: true, monthlyPayment: true } },
    },
    orderBy: { name: "asc" },
  })

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    balance: toNumber(a.balance),
    owner: a.owner,
    loan: a.loan
      ? {
          interestRate: toNumber(a.loan.interestRate),
          monthlyPayment: toNumber(a.loan.monthlyPayment),
        }
      : null,
  }))
}

/**
 * Returns full detail for a single account.
 *
 * Includes nested CC details, loan record, active APR rates, last 20 transactions,
 * and 12-month balance history. All Decimal fields are converted to numbers.
 * Throws if the account doesn't exist or doesn't belong to the current user.
 */
export async function getAccount(id: string) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({
    where: { id, userId },
    include: {
      creditCardDetails: true,
      loan: true,
      aprRates: { where: { isActive: true }, orderBy: { effectiveDate: "desc" } },
      transactions: {
        orderBy: { date: "desc" },
        take: 20,
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          type: true,
          category: true,
          account: { select: { id: true, name: true } },
        },
      },
    },
  })

  if (!account) throw new Error("Account not found")

  const balanceHistory = await getBalanceHistory(id)

  return {
    id: account.id,
    name: account.name,
    type: account.type,
    balance: toNumber(account.balance),
    creditLimit: account.creditLimit ? toNumber(account.creditLimit) : null,
    owner: account.owner,
    isActive: account.isActive,
    creditCardDetails: account.creditCardDetails
      ? {
          id: account.creditCardDetails.id,
          statementCloseDay: account.creditCardDetails.statementCloseDay,
          paymentDueDay: account.creditCardDetails.paymentDueDay,
          gracePeriodDays: account.creditCardDetails.gracePeriodDays,
          lastStatementBalance: toNumber(account.creditCardDetails.lastStatementBalance),
          lastStatementPaidInFull: account.creditCardDetails.lastStatementPaidInFull,
          minimumPaymentPct: toNumber(account.creditCardDetails.minimumPaymentPct),
          minimumPaymentFloor: toNumber(account.creditCardDetails.minimumPaymentFloor),
        }
      : null,
    loan: account.loan
      ? {
          id: account.loan.id,
          loanType: account.loan.loanType,
          originalBalance: toNumber(account.loan.originalBalance),
          interestRate: toNumber(account.loan.interestRate),
          termMonths: account.loan.termMonths,
          startDate: account.loan.startDate,
          monthlyPayment: toNumber(account.loan.monthlyPayment),
          extraPaymentAmount: toNumber(account.loan.extraPaymentAmount),
        }
      : null,
    aprRates: account.aprRates.map((r) => ({
      id: r.id,
      rateType: r.rateType,
      apr: toNumber(r.apr),
      effectiveDate: r.effectiveDate,
      expirationDate: r.expirationDate,
      description: r.description,
      isActive: r.isActive,
    })),
    transactions: account.transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: toNumber(t.amount),
      type: t.type,
      category: t.category,
      account: t.account,
    })),
    balanceHistory,
  }
}

/**
 * Creates a new account with optional nested CC details or loan record.
 *
 * Uses Prisma nested create to atomically insert the account and its
 * type-specific details in a single operation. CC details are created
 * when type is CREDIT_CARD; loan records when type is LOAN or MORTGAGE.
 */
export async function createAccount(data: {
  name: string
  type: AccountType
  balance: number
  owner?: string
  creditLimit?: number
  creditCard?: {
    statementCloseDay: number
    paymentDueDay: number
    gracePeriodDays: number
  }
  loan?: {
    loanType: string
    originalBalance: number
    interestRate: number
    termMonths: number
    startDate: string
    monthlyPayment: number
    extraPaymentAmount: number
  }
}) {
  const userId = await requireUserId()

  const account = await prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      balance: data.balance,
      creditLimit: data.creditLimit,
      owner: data.owner || null,
      userId,
      creditCardDetails:
        data.type === "CREDIT_CARD" && data.creditCard
          ? {
              create: {
                statementCloseDay: data.creditCard.statementCloseDay,
                paymentDueDay: data.creditCard.paymentDueDay,
                gracePeriodDays: data.creditCard.gracePeriodDays,
              },
            }
          : undefined,
      loan:
        (data.type === "LOAN" || data.type === "MORTGAGE") && data.loan
          ? {
              create: {
                loanType: data.loan.loanType as "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL",
                originalBalance: data.loan.originalBalance,
                interestRate: data.loan.interestRate,
                termMonths: data.loan.termMonths,
                startDate: new Date(data.loan.startDate),
                monthlyPayment: data.loan.monthlyPayment,
                extraPaymentAmount: data.loan.extraPaymentAmount,
              },
            }
          : undefined,
    },
  })

  // Create an opening balance transaction so the transaction ledger matches the
  // stored balance from day one. Without this, recalculate would show drift equal
  // to the starting balance for any newly created account.
  if (data.balance !== 0) {
    await prisma.transaction.create({
      data: {
        date: new Date(),
        description: "Opening Balance",
        amount: data.balance,
        type: data.balance > 0 ? "INCOME" : "EXPENSE",
        category: "Opening Balance",
        source: "SYSTEM",
        userId,
        accountId: account.id,
      },
    })
  }

  return { id: account.id }
}

/**
 * Updates an existing account and upserts its type-specific details.
 *
 * The account type cannot be changed after creation. CC details and loan
 * records are upserted (created if missing, updated if present) to handle
 * cases where details were not provided during initial creation.
 */
export async function updateAccount(
  id: string,
  data: {
    name: string
    balance: number
    owner?: string
    creditLimit?: number
    creditCard?: {
      statementCloseDay: number
      paymentDueDay: number
      gracePeriodDays: number
    }
    loan?: {
      loanType: string
      originalBalance: number
      interestRate: number
      termMonths: number
      startDate: string
      monthlyPayment: number
      extraPaymentAmount: number
    }
  }
) {
  const userId = await requireUserId()

  // Verify ownership
  const existing = await prisma.account.findFirst({ where: { id, userId } })
  if (!existing) throw new Error("Account not found")

  await prisma.account.update({
    where: { id },
    data: {
      name: data.name,
      balance: data.balance,
      creditLimit: data.creditLimit,
      owner: data.owner || null,
    },
  })

  // Upsert credit card details
  if (existing.type === "CREDIT_CARD" && data.creditCard) {
    await prisma.creditCardDetails.upsert({
      where: { accountId: id },
      create: {
        accountId: id,
        statementCloseDay: data.creditCard.statementCloseDay,
        paymentDueDay: data.creditCard.paymentDueDay,
        gracePeriodDays: data.creditCard.gracePeriodDays,
      },
      update: {
        statementCloseDay: data.creditCard.statementCloseDay,
        paymentDueDay: data.creditCard.paymentDueDay,
        gracePeriodDays: data.creditCard.gracePeriodDays,
      },
    })
  }

  // Upsert loan details
  if ((existing.type === "LOAN" || existing.type === "MORTGAGE") && data.loan) {
    await prisma.loan.upsert({
      where: { accountId: id },
      create: {
        accountId: id,
        loanType: data.loan.loanType as "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL",
        originalBalance: data.loan.originalBalance,
        interestRate: data.loan.interestRate,
        termMonths: data.loan.termMonths,
        startDate: new Date(data.loan.startDate),
        monthlyPayment: data.loan.monthlyPayment,
        extraPaymentAmount: data.loan.extraPaymentAmount,
      },
      update: {
        loanType: data.loan.loanType as "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL",
        originalBalance: data.loan.originalBalance,
        interestRate: data.loan.interestRate,
        termMonths: data.loan.termMonths,
        startDate: new Date(data.loan.startDate),
        monthlyPayment: data.loan.monthlyPayment,
        extraPaymentAmount: data.loan.extraPaymentAmount,
      },
    })
  }

  return { success: true }
}

/**
 * Soft-deletes an account by setting isActive to false.
 *
 * Accounts are never hard-deleted because transactions reference them.
 * Inactive accounts are excluded from all list queries and balance calculations.
 */
export async function deleteAccount(id: string) {
  const userId = await requireUserId()

  const existing = await prisma.account.findFirst({ where: { id, userId } })
  if (!existing) throw new Error("Account not found")

  await prisma.account.update({
    where: { id },
    data: { isActive: false },
  })

  return { success: true }
}

/**
 * Compares the stored balance against the sum of all transactions for an account.
 *
 * Returns the stored balance, calculated balance, and drift (difference).
 * Does NOT modify the balance — use confirmRecalculate() to apply corrections.
 */
export async function recalculateBalance(id: string) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({ where: { id, userId } })
  if (!account) throw new Error("Account not found")

  const result = await prisma.transaction.aggregate({
    where: { accountId: id },
    _sum: { amount: true },
  })

  const stored = toNumber(account.balance)
  const calculated = toNumber(result._sum.amount ?? 0)

  return { stored, calculated, drift: computeDrift(stored, calculated) }
}

/**
 * Applies the recalculated balance for a single account.
 *
 * Re-sums all transactions and overwrites the stored balance.
 * Called after the user reviews the drift from recalculateBalance().
 */
export async function confirmRecalculate(id: string) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({ where: { id, userId } })
  if (!account) throw new Error("Account not found")

  const result = await prisma.transaction.aggregate({
    where: { accountId: id },
    _sum: { amount: true },
  })

  const calculated = toNumber(result._sum.amount ?? 0)

  await prisma.account.update({
    where: { id },
    data: { balance: calculated },
  })

  return { balance: calculated }
}

/**
 * Returns a drift report for all active accounts.
 *
 * Compares each account's stored balance against the sum of its transactions.
 * Used by the settings page and recalculate API for bulk drift detection.
 */
export async function recalculateAllBalances() {
  const userId = await requireUserId()

  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, type: true, balance: true },
  })

  const results = await Promise.all(
    accounts.map(async (account) => {
      const result = await prisma.transaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      })

      const stored = toNumber(account.balance)
      const calculated = toNumber(result._sum.amount ?? 0)

      return {
        accountId: account.id,
        name: account.name,
        type: account.type,
        storedBalance: stored,
        calculatedBalance: calculated,
        drift: computeDrift(stored, calculated),
      }
    })
  )

  return results
}

/**
 * Applies recalculated balances for all active accounts with drift.
 *
 * Only updates accounts where the stored balance differs from the transaction sum.
 * Returns each account's new balance and whether it was corrected.
 */
export async function confirmRecalculateAll() {
  const userId = await requireUserId()

  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
    select: { id: true, balance: true },
  })

  const results = await Promise.all(
    accounts.map(async (account) => {
      const result = await prisma.transaction.aggregate({
        where: { accountId: account.id },
        _sum: { amount: true },
      })

      const calculated = toNumber(result._sum.amount ?? 0)
      const stored = toNumber(account.balance)
      const drift = computeDrift(stored, calculated)

      if (drift !== 0) {
        await prisma.account.update({
          where: { id: account.id },
          data: { balance: calculated },
        })
      }

      return { accountId: account.id, balance: calculated, corrected: drift !== 0 }
    })
  )

  return results
}

/**
 * Computes monthly end-of-month balances by walking backwards from the current balance.
 *
 * Algorithm:
 * 1. Start with the current stored balance as the most recent month's value
 * 2. Group all transactions in the period by month (YYYY-MM key)
 * 3. Walk backwards: each prior month's balance = next month's balance - that month's transaction sum
 *
 * Returns an array sorted chronologically: [{ date: "2025-03", balance: 1234.56 }, ...]
 */
export async function getBalanceHistory(
  accountId: string,
  months: number = 12
): Promise<{ date: string; balance: number }[]> {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({ where: { id: accountId, userId } })
  if (!account) throw new Error("Account not found")

  const currentBalance = toNumber(account.balance)
  const now = new Date()

  // Fetch all transactions within the history window
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const transactions = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: startDate },
    },
    select: { date: true, amount: true },
    orderBy: { date: "asc" },
  })

  // Group transactions by month
  const monthlyTotals: Record<string, number> = {}
  for (const t of transactions) {
    const d = new Date(t.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    monthlyTotals[key] = (monthlyTotals[key] || 0) + toNumber(t.amount)
  }

  // Build month keys from start to current
  const monthKeys: string[] = []
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1)
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`)
  }

  return computeBalanceHistory(currentBalance, monthlyTotals, monthKeys)
}
