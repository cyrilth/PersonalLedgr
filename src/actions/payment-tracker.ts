"use server"

/**
 * Server actions for the unified Payment Tracker page.
 *
 * Fetches payment obligations (bills, loans, CCs) and their payment history
 * across a date range. All three obligation types are normalized into a
 * common shape for the grid component.
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"

// ── Helpers ──────────────────────────────────────────────────────────

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

function toNumber(d: unknown): number {
  return Number(d)
}

// ── Types ────────────────────────────────────────────────────────────

export type ObligationType = "bill" | "loan" | "credit_card"

export interface PaymentObligation {
  id: string                  // bill.id, loan.accountId, or CC accountId
  name: string                // bill name or account name
  type: ObligationType
  expectedAmount: number      // bill amount, monthlyPayment, or lastStatementBalance
  dueDay: number | null       // dayOfMonth / paymentDueDay / CC paymentDueDay
  frequency: string           // bill frequency or "MONTHLY"
  accountId: string           // linked account
  startMonth?: number         // loan start month (1-12)
  startYear?: number          // loan start year
  termMonths?: number         // loan term
  isVariableAmount?: boolean  // bills only
  // For bill payment dialog
  billId?: string             // RecurringBill.id (only for bills)
  loanId?: string             // Loan.id (only for loans, used for navigation)
}

export interface PaymentRecord {
  id: string                  // BillPayment.id or Transaction.id
  month: number
  year: number
  amount: number
  paidAt?: Date               // BillPayment.paidAt (bills only)
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Fetches all payment obligations for the current user across 3 categories:
 * bills, loans, and credit cards.
 */
export async function getPaymentObligations(): Promise<PaymentObligation[]> {
  const userId = await requireUserId()

  const [bills, loanAccounts, ccAccounts] = await Promise.all([
    // Bills: active recurring bills
    prisma.recurringBill.findMany({
      where: { userId, isActive: true },
      include: {
        account: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),

    // Loans: active LOAN/MORTGAGE accounts with a Loan record and negative balance
    prisma.account.findMany({
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
    }),

    // Credit cards: active CC accounts with CreditCardDetails
    prisma.account.findMany({
      where: {
        userId,
        isActive: true,
        type: "CREDIT_CARD",
        creditCardDetails: { isNot: null },
      },
      include: {
        creditCardDetails: true,
      },
      orderBy: { name: "asc" },
    }),
  ])

  const obligations: PaymentObligation[] = []

  // Map bills
  for (const b of bills) {
    obligations.push({
      id: `bill-${b.id}`,
      name: b.name,
      type: "bill",
      expectedAmount: toNumber(b.amount),
      dueDay: b.dayOfMonth,
      frequency: b.frequency,
      accountId: b.accountId,
      isVariableAmount: b.isVariableAmount,
      billId: b.id,
    })
  }

  // Map loans
  for (const a of loanAccounts) {
    if (!a.loan) continue
    const startDate = new Date(a.loan.startDate)
    obligations.push({
      id: `loan-${a.id}`,
      name: a.name,
      type: "loan",
      expectedAmount: toNumber(a.loan.monthlyPayment),
      dueDay: a.loan.paymentDueDay,
      frequency: "MONTHLY",
      accountId: a.id,
      startMonth: startDate.getMonth() + 1,
      startYear: startDate.getFullYear(),
      termMonths: a.loan.termMonths,
      loanId: a.loan.id,
    })
  }

  // Map credit cards
  for (const a of ccAccounts) {
    if (!a.creditCardDetails) continue
    obligations.push({
      id: `cc-${a.id}`,
      name: a.name,
      type: "credit_card",
      expectedAmount: toNumber(a.creditCardDetails.lastStatementBalance),
      dueDay: a.creditCardDetails.paymentDueDay,
      frequency: "MONTHLY",
      accountId: a.id,
    })
  }

  return obligations
}

/**
 * Fetches payment records for all obligations within a date range.
 * Returns a map keyed by obligation id (matching PaymentObligation.id).
 */
export async function getPaymentRecords(
  startMonth: number,
  startYear: number,
  endMonth: number,
  endYear: number
): Promise<Record<string, PaymentRecord[]>> {
  const userId = await requireUserId()

  // Build date range for transaction queries
  const startDate = new Date(startYear, startMonth - 1, 1)
  const endDate = new Date(endYear, endMonth, 0, 23, 59, 59) // last day of endMonth

  const [billPayments, loanTransactions, ccTransactions] = await Promise.all([
    // Bill payments from BillPayment table
    prisma.billPayment.findMany({
      where: {
        recurringBill: { userId },
        OR: [
          { year: { gt: startYear, lt: endYear } },
          { year: startYear, month: { gte: startMonth } },
          ...(endYear !== startYear
            ? [{ year: endYear, month: { lte: endMonth } }]
            : []),
        ],
      },
      include: {
        recurringBill: { select: { id: true } },
      },
    }),

    // Loan payments: LOAN_PRINCIPAL transactions on loan accounts
    prisma.transaction.findMany({
      where: {
        userId,
        type: "LOAN_PRINCIPAL",
        account: {
          type: { in: ["LOAN", "MORTGAGE"] },
          loan: { isNot: null },
        },
        date: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        accountId: true,
      },
    }),

    // CC payments: positive TRANSFER transactions to CC accounts
    prisma.transaction.findMany({
      where: {
        userId,
        type: "TRANSFER",
        account: {
          type: "CREDIT_CARD",
          creditCardDetails: { isNot: null },
        },
        amount: { gt: 0 },
        date: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        accountId: true,
      },
    }),
  ])

  const result: Record<string, PaymentRecord[]> = {}

  // Filter bill payments for same-year range
  const filteredBillPayments =
    startYear === endYear
      ? billPayments.filter((p) => p.month >= startMonth && p.month <= endMonth)
      : billPayments

  // Map bill payments
  for (const p of filteredBillPayments) {
    const key = `bill-${p.recurringBill.id}`
    if (!result[key]) result[key] = []
    result[key].push({
      id: p.id,
      month: p.month,
      year: p.year,
      amount: toNumber(p.amount),
      paidAt: p.paidAt,
    })
  }

  // Map loan payments — group by accountId + month/year
  for (const t of loanTransactions) {
    const d = new Date(t.date)
    const month = d.getMonth() + 1
    const year = d.getFullYear()
    const key = `loan-${t.accountId}`

    if (!result[key]) result[key] = []

    // Check if we already have a record for this month (sum multiple payments in same month)
    const existing = result[key].find((r) => r.month === month && r.year === year)
    if (existing) {
      existing.amount += Math.abs(toNumber(t.amount))
    } else {
      result[key].push({
        id: t.id,
        month,
        year,
        amount: Math.abs(toNumber(t.amount)),
      })
    }
  }

  // Map CC payments — group by accountId + month/year
  for (const t of ccTransactions) {
    const d = new Date(t.date)
    const month = d.getMonth() + 1
    const year = d.getFullYear()
    const key = `cc-${t.accountId}`

    if (!result[key]) result[key] = []

    const existing = result[key].find((r) => r.month === month && r.year === year)
    if (existing) {
      existing.amount += toNumber(t.amount)
    } else {
      result[key].push({
        id: t.id,
        month,
        year,
        amount: toNumber(t.amount),
      })
    }
  }

  return result
}
