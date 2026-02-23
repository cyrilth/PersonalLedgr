"use server"

/**
 * Server actions for Loan CRUD operations.
 *
 * Loans are represented as Account (type: LOAN or MORTGAGE) + linked Loan record.
 * This module provides loan-specific queries and mutations while delegating
 * account-level operations to Prisma directly.
 *
 * Key patterns:
 * - Prisma Decimal → toNumber() before returning across the server action boundary
 * - Loan/mortgage balances are stored as negative (owed money)
 * - Soft delete via isActive flag on the parent Account
 * - createLoan atomically creates Account + Loan + opening balance transaction
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the authenticated user's ID from the session cookie.
 * Every loan action calls this first to scope queries to the current user.
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

/** Lightweight loan data for list/card display — combines Account + Loan fields. */
export interface LoanSummary {
  id: string
  accountId: string
  accountName: string
  loanType: string
  balance: number
  originalBalance: number
  interestRate: number
  termMonths: number
  startDate: Date
  monthlyPayment: number
  extraPaymentAmount: number
  owner: string | null
  isActive: boolean
}

/** Full loan detail including payment history and interest accrual records. */
export interface LoanDetail extends LoanSummary {
  transactions: {
    id: string
    date: Date
    description: string
    amount: number
    type: string
    category: string | null
  }[]
  interestLogs: {
    id: string
    date: Date
    amount: number
    type: string
    notes: string | null
  }[]
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Returns all active loans with their parent account data.
 *
 * Queries accounts of type LOAN or MORTGAGE that have a linked Loan record,
 * then flattens the Account + Loan relationship into a single LoanSummary shape.
 * Results are sorted alphabetically by account name.
 */
export async function getLoans(): Promise<LoanSummary[]> {
  const userId = await requireUserId()

  const accounts = await prisma.account.findMany({
    where: {
      userId,
      isActive: true,
      type: { in: ["LOAN", "MORTGAGE"] },
      loan: { isNot: null },
    },
    include: {
      loan: true,
    },
    orderBy: { name: "asc" },
  })

  // Safety filter: Prisma's `isNot: null` should guarantee loan exists,
  // but we guard against null anyway for type narrowing via the `!` assertion below
  return accounts
    .filter((a) => a.loan !== null)
    .map((a) => ({
      id: a.loan!.id,
      accountId: a.id,
      accountName: a.name,
      loanType: a.loan!.loanType,
      balance: toNumber(a.balance),
      originalBalance: toNumber(a.loan!.originalBalance),
      interestRate: toNumber(a.loan!.interestRate),
      termMonths: a.loan!.termMonths,
      startDate: a.loan!.startDate,
      monthlyPayment: toNumber(a.loan!.monthlyPayment),
      extraPaymentAmount: toNumber(a.loan!.extraPaymentAmount),
      owner: a.owner,
      isActive: a.isActive,
    }))
}

/**
 * Returns a single loan with full detail including recent transactions and interest logs.
 *
 * Looks up the loan by its Loan.id (not Account.id) and includes the last 50
 * transactions and all interest log entries for the parent account.
 * Throws "Loan not found" if the loan doesn't exist or doesn't belong to the current user.
 */
export async function getLoan(id: string): Promise<LoanDetail> {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({
    where: {
      userId,
      loan: { id },
    },
    include: {
      loan: true,
      transactions: {
        orderBy: { date: "desc" },
        take: 50,
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          type: true,
          category: true,
        },
      },
      interestLogs: {
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          amount: true,
          type: true,
          notes: true,
        },
      },
    },
  })

  if (!account || !account.loan) throw new Error("Loan not found")

  return {
    id: account.loan.id,
    accountId: account.id,
    accountName: account.name,
    loanType: account.loan.loanType,
    balance: toNumber(account.balance),
    originalBalance: toNumber(account.loan.originalBalance),
    interestRate: toNumber(account.loan.interestRate),
    termMonths: account.loan.termMonths,
    startDate: account.loan.startDate,
    monthlyPayment: toNumber(account.loan.monthlyPayment),
    extraPaymentAmount: toNumber(account.loan.extraPaymentAmount),
    owner: account.owner,
    isActive: account.isActive,
    transactions: account.transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: toNumber(t.amount),
      type: t.type,
      category: t.category,
    })),
    interestLogs: account.interestLogs.map((l) => ({
      id: l.id,
      date: l.date,
      amount: toNumber(l.amount),
      type: l.type,
      notes: l.notes,
    })),
  }
}

/**
 * Creates a new loan: Account (type LOAN or MORTGAGE) + Loan record + opening balance transaction.
 *
 * Uses a Prisma interactive transaction so all three writes succeed or fail atomically.
 * The opening balance transaction ensures recalculateBalance() stays in sync from day one.
 * Validates name, interest rate, term, and monthly payment before writing.
 *
 * @returns The new Loan.id and parent Account.id
 * @throws "Loan name is required" | "Interest rate must be non-negative" |
 *         "Term must be positive" | "Monthly payment must be positive"
 */
export async function createLoan(data: {
  name: string
  type: "LOAN" | "MORTGAGE"
  balance: number
  owner?: string
  loanType: "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL"
  originalBalance: number
  interestRate: number
  termMonths: number
  startDate: string
  monthlyPayment: number
  extraPaymentAmount?: number
}) {
  const userId = await requireUserId()

  if (!data.name?.trim()) throw new Error("Loan name is required")
  if (data.interestRate < 0) throw new Error("Interest rate must be non-negative")
  if (data.termMonths <= 0) throw new Error("Term must be positive")
  if (data.monthlyPayment <= 0) throw new Error("Monthly payment must be positive")

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: data.name.trim(),
        type: data.type,
        balance: data.balance,
        owner: data.owner || null,
        userId,
        loan: {
          create: {
            loanType: data.loanType,
            originalBalance: data.originalBalance,
            interestRate: data.interestRate,
            termMonths: data.termMonths,
            startDate: new Date(data.startDate),
            monthlyPayment: data.monthlyPayment,
            extraPaymentAmount: data.extraPaymentAmount ?? 0,
          },
        },
      },
      include: { loan: true },
    })

    // Create opening balance transaction so recalculation stays in sync
    if (data.balance !== 0) {
      await tx.transaction.create({
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

    return { id: account.loan!.id, accountId: account.id }
  })

  return result
}

/**
 * Updates loan details without changing the account type.
 *
 * Accepts a partial update — only provided fields are written. Account-level
 * fields (name, owner) and loan-specific fields (interestRate, termMonths, etc.)
 * are updated independently so unchanged fields are never overwritten.
 * Looks up the loan by Loan.id and verifies user ownership.
 *
 * @throws "Loan not found" if the loan doesn't exist or doesn't belong to the current user
 */
export async function updateLoan(
  id: string,
  data: {
    name?: string
    owner?: string
    loanType?: "MORTGAGE" | "AUTO" | "STUDENT" | "PERSONAL"
    interestRate?: number
    termMonths?: number
    monthlyPayment?: number
    extraPaymentAmount?: number
  }
) {
  const userId = await requireUserId()

  // Find the account that owns this loan
  const account = await prisma.account.findFirst({
    where: { userId, loan: { id } },
    include: { loan: true },
  })

  if (!account || !account.loan) throw new Error("Loan not found")

  // Update account-level fields
  const accountUpdate: Record<string, unknown> = {}
  if (data.name !== undefined) accountUpdate.name = data.name.trim()
  if (data.owner !== undefined) accountUpdate.owner = data.owner || null

  if (Object.keys(accountUpdate).length > 0) {
    await prisma.account.update({
      where: { id: account.id },
      data: accountUpdate,
    })
  }

  // Update loan-specific fields
  const loanUpdate: Record<string, unknown> = {}
  if (data.loanType !== undefined) loanUpdate.loanType = data.loanType
  if (data.interestRate !== undefined) loanUpdate.interestRate = data.interestRate
  if (data.termMonths !== undefined) loanUpdate.termMonths = data.termMonths
  if (data.monthlyPayment !== undefined) loanUpdate.monthlyPayment = data.monthlyPayment
  if (data.extraPaymentAmount !== undefined) loanUpdate.extraPaymentAmount = data.extraPaymentAmount

  if (Object.keys(loanUpdate).length > 0) {
    await prisma.loan.update({
      where: { id },
      data: loanUpdate,
    })
  }

  return { success: true }
}

/**
 * Soft-deletes a loan by setting isActive to false on the parent account.
 *
 * The Loan record and all transactions are preserved for historical reporting.
 * Inactive accounts are excluded from all list queries and balance calculations.
 * Use reactivateAccount() from accounts.ts to undo this operation.
 *
 * @throws "Loan not found" if the loan doesn't exist or doesn't belong to the current user
 */
export async function deleteLoan(id: string) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({
    where: { userId, loan: { id } },
  })

  if (!account) throw new Error("Loan not found")

  await prisma.account.update({
    where: { id: account.id },
    data: { isActive: false },
  })

  return { success: true }
}

/**
 * Calculates total interest already paid on a loan by summing its interest_log entries.
 *
 * Queries the InterestLog table for all entries linked to the loan's parent account.
 * This is the historical counterpart to calculateTotalInterestRemaining() in calculations.ts
 * which computes future interest from the amortization schedule.
 *
 * @param loanId - The Loan record ID (not the Account ID)
 * @returns Total interest paid as a positive number, rounded to cents
 * @throws "Loan not found" if the loan doesn't exist or doesn't belong to the current user
 */
export async function calculateTotalInterestPaid(loanId: string): Promise<number> {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({
    where: { userId, loan: { id: loanId } },
  })

  if (!account) throw new Error("Loan not found")

  const result = await prisma.interestLog.aggregate({
    where: { accountId: account.id },
    _sum: { amount: true },
  })

  return Math.round(toNumber(result._sum.amount ?? 0) * 100) / 100
}
