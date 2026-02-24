"use server"

/**
 * Server actions for bill payment ledger management.
 *
 * BillPayment records track which recurring bills have been paid for each
 * month/year. Each payment is linked to an actual EXPENSE transaction.
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

export interface BillPaymentRecord {
  id: string
  recurringBillId: string
  month: number
  year: number
  amount: number
  paidAt: Date
  transactionId: string | null
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Returns all BillPayment records within a date range, keyed by recurringBillId.
 * Used by the ledger grid to determine cell payment status.
 */
export async function getBillPayments(
  startMonth: number,
  startYear: number,
  endMonth: number,
  endYear: number
): Promise<Record<string, BillPaymentRecord[]>> {
  const userId = await requireUserId()

  // Get all bill IDs for this user first
  const userBills = await prisma.recurringBill.findMany({
    where: { userId },
    select: { id: true },
  })
  const billIds = userBills.map((b) => b.id)

  if (billIds.length === 0) return {}

  const payments = await prisma.billPayment.findMany({
    where: {
      recurringBillId: { in: billIds },
      OR: [
        // Same year range
        {
          year: { gt: startYear, lt: endYear },
        },
        // Start year
        {
          year: startYear,
          month: { gte: startMonth },
        },
        // End year (if different from start)
        ...(endYear !== startYear
          ? [{ year: endYear, month: { lte: endMonth } }]
          : []),
      ],
    },
  })

  // If start and end are the same year, filter to the month range
  const filtered =
    startYear === endYear
      ? payments.filter((p) => p.month >= startMonth && p.month <= endMonth)
      : payments

  const grouped: Record<string, BillPaymentRecord[]> = {}
  for (const p of filtered) {
    const record: BillPaymentRecord = {
      id: p.id,
      recurringBillId: p.recurringBillId,
      month: p.month,
      year: p.year,
      amount: toNumber(p.amount),
      paidAt: p.paidAt,
      transactionId: p.transactionId,
    }
    if (!grouped[p.recurringBillId]) {
      grouped[p.recurringBillId] = []
    }
    grouped[p.recurringBillId].push(record)
  }

  return grouped
}

/**
 * Records a bill payment: creates an EXPENSE transaction, updates account
 * balance, and creates a BillPayment record — all atomically.
 */
export async function recordBillPayment(data: {
  recurringBillId: string
  amount: number
  month: number
  year: number
  accountId: string
  date?: Date
}) {
  const userId = await requireUserId()

  // Verify bill ownership
  const bill = await prisma.recurringBill.findFirst({
    where: { id: data.recurringBillId, userId },
  })
  if (!bill) throw new Error("Bill not found")

  const negativeAmount = -Math.abs(data.amount)
  const paymentDate = data.date ?? new Date()

  const result = await prisma.$transaction(async (tx) => {
    // Create the expense transaction
    const transaction = await tx.transaction.create({
      data: {
        date: paymentDate,
        description: bill.name,
        amount: negativeAmount,
        type: "EXPENSE",
        category: bill.category ?? undefined,
        source: "RECURRING",
        userId,
        accountId: data.accountId,
      },
    })

    // Update account balance
    await tx.account.update({
      where: { id: data.accountId },
      data: {
        balance: { decrement: Math.abs(data.amount) },
      },
    })

    // Create BillPayment record
    const billPayment = await tx.billPayment.create({
      data: {
        month: data.month,
        year: data.year,
        amount: Math.abs(data.amount),
        recurringBillId: data.recurringBillId,
        transactionId: transaction.id,
      },
    })

    return { billPaymentId: billPayment.id, transactionId: transaction.id }
  })

  return result
}

/**
 * Links an existing transaction to a bill as its payment for a given month.
 * Does NOT create a new transaction or change the balance — the transaction
 * already exists (e.g., from a CSV import).
 */
export async function linkTransactionToBill(data: {
  recurringBillId: string
  transactionId: string
  month: number
  year: number
}) {
  const userId = await requireUserId()

  const bill = await prisma.recurringBill.findFirst({
    where: { id: data.recurringBillId, userId },
  })
  if (!bill) throw new Error("Bill not found")

  const transaction = await prisma.transaction.findFirst({
    where: { id: data.transactionId, userId },
  })
  if (!transaction) throw new Error("Transaction not found")

  // Check this transaction isn't already linked to another bill payment
  const alreadyLinked = await prisma.billPayment.findUnique({
    where: { transactionId: data.transactionId },
  })
  if (alreadyLinked) throw new Error("Transaction is already linked to a bill payment")

  const billPayment = await prisma.billPayment.create({
    data: {
      month: data.month,
      year: data.year,
      amount: Math.abs(toNumber(transaction.amount)),
      recurringBillId: data.recurringBillId,
      transactionId: data.transactionId,
    },
  })

  return { billPaymentId: billPayment.id }
}

export interface MatchingTransaction {
  id: string
  date: Date
  description: string
  amount: number
  source: string
}

/**
 * Finds recent EXPENSE transactions on any account that could be the payment
 * for a given bill in a given month. Used by the payment dialog to offer
 * "link existing" instead of creating duplicates.
 */
export async function getMatchingTransactions(
  recurringBillId: string,
  month: number,
  year: number
): Promise<MatchingTransaction[]> {
  const userId = await requireUserId()

  const bill = await prisma.recurringBill.findFirst({
    where: { id: recurringBillId, userId },
  })
  if (!bill) return []

  // Search window: the target month ± 5 days on each side
  const startDate = new Date(year, month - 1, 1)
  startDate.setDate(startDate.getDate() - 5)
  const endDate = new Date(year, month, 0) // last day of month
  endDate.setDate(endDate.getDate() + 5)

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      type: "EXPENSE",
      date: { gte: startDate, lte: endDate },
      // Exclude transactions already linked to a bill payment
      billPayment: null,
    },
    orderBy: { date: "desc" },
    take: 20,
  })

  return transactions.map((t) => ({
    id: t.id,
    date: t.date,
    description: t.description,
    amount: toNumber(t.amount),
    source: t.source,
  }))
}

/**
 * Deletes a bill payment record. Behavior depends on how the payment was created:
 *
 * - "New Transaction" payments (source=RECURRING): deletes the transaction,
 *   reverses the balance change, and cascades to remove the BillPayment.
 * - "Link Existing" payments (any other source): only removes the BillPayment
 *   record, leaving the original imported/manual transaction untouched.
 */
export async function deleteBillPayment(id: string) {
  const userId = await requireUserId()

  const payment = await prisma.billPayment.findUnique({
    where: { id },
    include: {
      recurringBill: { select: { userId: true } },
      transaction: { select: { id: true, amount: true, accountId: true, source: true } },
    },
  })

  if (!payment || payment.recurringBill.userId !== userId) {
    throw new Error("Payment not found")
  }

  await prisma.$transaction(async (tx) => {
    if (payment.transaction && payment.transaction.source === "RECURRING") {
      // Payment was created via "New Transaction" — reverse balance and delete transaction
      const txAmount = toNumber(payment.transaction.amount)
      await tx.account.update({
        where: { id: payment.transaction.accountId },
        data: {
          balance: { increment: Math.abs(txAmount) },
        },
      })

      // Delete the transaction (cascades to BillPayment via onDelete: Cascade)
      await tx.transaction.delete({
        where: { id: payment.transaction.id },
      })
    } else {
      // Linked payment or no transaction — just remove the BillPayment record.
      // The original transaction (e.g. from CSV import) is preserved.
      await tx.billPayment.delete({
        where: { id },
      })
    }
  })

  return { success: true }
}
