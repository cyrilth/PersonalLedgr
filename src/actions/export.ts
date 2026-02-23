"use server"

/**
 * Server actions for exporting user finance data.
 *
 * Provides JSON export (all data) and CSV export (transactions only).
 * All queries are scoped to the authenticated user.
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"

async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

function toNumber(d: unknown): number {
  return Number(d)
}

/**
 * Exports all user finance data as a JSON string.
 * Includes accounts (with nested CC details, loan, APR rates),
 * transactions, budgets, recurring bills, and interest logs.
 */
export async function exportAllDataJSON(): Promise<string> {
  const userId = await requireUserId()

  const [accounts, transactions, budgets, recurringBills, interestLogs] =
    await Promise.all([
      prisma.account.findMany({
        where: { userId },
        include: {
          creditCardDetails: true,
          loan: true,
          aprRates: true,
        },
      }),
      prisma.transaction.findMany({
        where: { userId },
        include: { account: { select: { name: true } } },
        orderBy: { date: "desc" },
      }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.recurringBill.findMany({
        where: { userId },
        include: { account: { select: { name: true } } },
      }),
      prisma.interestLog.findMany({
        where: { userId },
        include: { account: { select: { name: true } } },
      }),
    ])

  const data = {
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: toNumber(a.balance),
      creditLimit: a.creditLimit ? toNumber(a.creditLimit) : null,
      owner: a.owner,
      isActive: a.isActive,
      creditCardDetails: a.creditCardDetails
        ? {
            statementCloseDay: a.creditCardDetails.statementCloseDay,
            paymentDueDay: a.creditCardDetails.paymentDueDay,
            gracePeriodDays: a.creditCardDetails.gracePeriodDays,
            lastStatementBalance: toNumber(a.creditCardDetails.lastStatementBalance),
            lastStatementPaidInFull: a.creditCardDetails.lastStatementPaidInFull,
            minimumPaymentPct: toNumber(a.creditCardDetails.minimumPaymentPct),
            minimumPaymentFloor: toNumber(a.creditCardDetails.minimumPaymentFloor),
          }
        : null,
      loan: a.loan
        ? {
            loanType: a.loan.loanType,
            originalBalance: toNumber(a.loan.originalBalance),
            interestRate: toNumber(a.loan.interestRate),
            termMonths: a.loan.termMonths,
            startDate: a.loan.startDate.toISOString(),
            monthlyPayment: toNumber(a.loan.monthlyPayment),
            extraPaymentAmount: toNumber(a.loan.extraPaymentAmount),
          }
        : null,
      aprRates: a.aprRates.map((r) => ({
        rateType: r.rateType,
        apr: toNumber(r.apr),
        effectiveDate: r.effectiveDate.toISOString(),
        expirationDate: r.expirationDate?.toISOString() ?? null,
        description: r.description,
        isActive: r.isActive,
      })),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date.toISOString(),
      description: t.description,
      amount: toNumber(t.amount),
      type: t.type,
      category: t.category,
      source: t.source,
      notes: t.notes,
      accountName: t.account.name,
      linkedTransactionId: t.linkedTransactionId,
    })),
    budgets: budgets.map((b) => ({
      id: b.id,
      category: b.category,
      period: b.period,
      limit: toNumber(b.limit),
    })),
    recurringBills: recurringBills.map((r) => ({
      id: r.id,
      name: r.name,
      amount: toNumber(r.amount),
      frequency: r.frequency,
      dayOfMonth: r.dayOfMonth,
      isVariableAmount: r.isVariableAmount,
      category: r.category,
      isActive: r.isActive,
      nextDueDate: r.nextDueDate.toISOString(),
      accountName: r.account.name,
    })),
    interestLogs: interestLogs.map((l) => ({
      id: l.id,
      date: l.date.toISOString(),
      amount: toNumber(l.amount),
      type: l.type,
      notes: l.notes,
      accountName: l.account.name,
    })),
  }

  return JSON.stringify(data, null, 2)
}

/**
 * Exports all user transactions as a CSV string.
 */
export async function exportTransactionsCSV(): Promise<string> {
  const userId = await requireUserId()

  const transactions = await prisma.transaction.findMany({
    where: { userId },
    include: { account: { select: { name: true } } },
    orderBy: { date: "desc" },
  })

  const header = "Date,Description,Amount,Type,Category,Source,Account,Notes"
  const rows = transactions.map((t) => {
    const date = new Date(t.date).toISOString().split("T")[0]
    const desc = csvEscape(t.description)
    const amount = toNumber(t.amount).toFixed(2)
    const type = t.type
    const category = csvEscape(t.category ?? "")
    const source = t.source
    const account = csvEscape(t.account.name)
    const notes = csvEscape(t.notes ?? "")
    return `${date},${desc},${amount},${type},${category},${source},${account},${notes}`
  })

  return [header, ...rows].join("\n")
}

/** Escapes a CSV field value — wraps in quotes if it contains comma, quote, or newline. */
function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
