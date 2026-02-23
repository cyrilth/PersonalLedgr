"use server"

/**
 * Server actions for recurring bill management.
 *
 * Recurring bills represent regularly-scheduled expenses (rent, utilities,
 * subscriptions, etc.) that can optionally be auto-generated as transactions
 * by the cron container. Bills can be fixed-amount or variable-amount:
 *
 * - Fixed: exact amount is known upfront (e.g., Netflix $15.99/month)
 * - Variable: estimated amount with actual confirmed later (e.g., electric bill)
 *
 * Key patterns:
 * - Prisma Decimal → toNumber() before returning across the server action boundary
 * - Soft delete via isActive flag (never hard-delete bills with history)
 * - nextDueDate advances after each generated transaction
 * - Variable bills generate transactions with notes="PENDING_CONFIRMATION"
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extracts the authenticated user's ID from the session cookie.
 * Every recurring bill action calls this first to scope queries to the current user.
 * Throws if no valid session exists.
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

/** Recurring bill with associated payment account info for display. */
export interface RecurringBillSummary {
  id: string
  name: string
  amount: number
  frequency: string
  dayOfMonth: number
  isVariableAmount: boolean
  category: string | null
  isActive: boolean
  nextDueDate: Date
  account: {
    id: string
    name: string
  }
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Returns all active recurring bills for the current user with payment account info.
 *
 * Bills are sorted by nextDueDate ascending (soonest due first).
 * Only returns active bills by default. Includes the payment account name
 * for display in the bill card.
 */
export async function getRecurringBills(): Promise<RecurringBillSummary[]> {
  const userId = await requireUserId()

  const bills = await prisma.recurringBill.findMany({
    where: { userId, isActive: true },
    include: {
      account: {
        select: { id: true, name: true },
      },
    },
    orderBy: { nextDueDate: "asc" },
  })

  return bills.map((b) => ({
    id: b.id,
    name: b.name,
    amount: toNumber(b.amount),
    frequency: b.frequency,
    dayOfMonth: b.dayOfMonth,
    isVariableAmount: b.isVariableAmount,
    category: b.category,
    isActive: b.isActive,
    nextDueDate: b.nextDueDate,
    account: b.account,
  }))
}

/**
 * Creates a new recurring bill linked to a payment account.
 *
 * Validates required fields (name, amount, dayOfMonth range, accountId).
 * The nextDueDate is calculated from the dayOfMonth for the current or next month.
 *
 * @throws "Bill name is required" | "Amount must be positive" |
 *         "Day of month must be between 1 and 31" | "Account is required"
 */
export async function createRecurringBill(data: {
  name: string
  amount: number
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL"
  dayOfMonth: number
  isVariableAmount?: boolean
  category?: string
  accountId: string
}) {
  const userId = await requireUserId()

  if (!data.name?.trim()) throw new Error("Bill name is required")
  if (data.amount <= 0) throw new Error("Amount must be positive")
  if (data.dayOfMonth < 1 || data.dayOfMonth > 31) throw new Error("Day of month must be between 1 and 31")
  if (!data.accountId) throw new Error("Account is required")

  // Calculate initial nextDueDate: this month's dayOfMonth if not yet passed, else next month
  const now = new Date()
  let nextDue = new Date(now.getFullYear(), now.getMonth(), data.dayOfMonth)
  if (nextDue <= now) {
    nextDue = new Date(now.getFullYear(), now.getMonth() + 1, data.dayOfMonth)
  }

  const bill = await prisma.recurringBill.create({
    data: {
      name: data.name.trim(),
      amount: data.amount,
      frequency: data.frequency,
      dayOfMonth: data.dayOfMonth,
      isVariableAmount: data.isVariableAmount ?? false,
      category: data.category || null,
      nextDueDate: nextDue,
      userId,
      accountId: data.accountId,
    },
  })

  return { id: bill.id }
}

/**
 * Updates a recurring bill's details.
 *
 * Accepts a partial update — only provided fields are written.
 * The amount is always editable regardless of variable/fixed status.
 * Verifies ownership before updating.
 *
 * @throws "Bill not found" if the bill doesn't exist or doesn't belong to the current user
 */
export async function updateRecurringBill(
  id: string,
  data: {
    name?: string
    amount?: number
    frequency?: "MONTHLY" | "QUARTERLY" | "ANNUAL"
    dayOfMonth?: number
    isVariableAmount?: boolean
    category?: string
    accountId?: string
  }
) {
  const userId = await requireUserId()

  const bill = await prisma.recurringBill.findFirst({
    where: { id, userId },
  })
  if (!bill) throw new Error("Bill not found")

  const update: Record<string, unknown> = {}
  if (data.name !== undefined) update.name = data.name.trim()
  if (data.amount !== undefined) update.amount = data.amount
  if (data.frequency !== undefined) update.frequency = data.frequency
  if (data.dayOfMonth !== undefined) update.dayOfMonth = data.dayOfMonth
  if (data.isVariableAmount !== undefined) update.isVariableAmount = data.isVariableAmount
  if (data.category !== undefined) update.category = data.category || null
  if (data.accountId !== undefined) update.accountId = data.accountId

  // If dayOfMonth changed, recalculate nextDueDate
  if (data.dayOfMonth !== undefined) {
    const now = new Date()
    let nextDue = new Date(now.getFullYear(), now.getMonth(), data.dayOfMonth)
    if (nextDue <= now) {
      nextDue = new Date(now.getFullYear(), now.getMonth() + 1, data.dayOfMonth)
    }
    update.nextDueDate = nextDue
  }

  await prisma.recurringBill.update({
    where: { id },
    data: update,
  })

  return { success: true }
}

/**
 * Soft-deletes a recurring bill by setting isActive to false.
 *
 * The bill record is preserved for historical reference. Inactive bills
 * are excluded from list queries and cron auto-generation.
 *
 * @throws "Bill not found" if the bill doesn't exist or doesn't belong to the current user
 */
export async function deleteRecurringBill(id: string) {
  const userId = await requireUserId()

  const bill = await prisma.recurringBill.findFirst({
    where: { id, userId },
  })
  if (!bill) throw new Error("Bill not found")

  await prisma.recurringBill.update({
    where: { id },
    data: { isActive: false },
  })

  return { success: true }
}

/**
 * Returns recurring bills due within the next N days.
 *
 * Calculates a date window from today to today + days, and returns
 * all active bills whose nextDueDate falls within that window.
 * Includes a computed `daysUntilDue` field for display.
 *
 * @param days - Number of days to look ahead (default: 30)
 */
export async function getUpcomingBills(days: number = 30) {
  const userId = await requireUserId()

  const now = new Date()
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  const bills = await prisma.recurringBill.findMany({
    where: {
      userId,
      isActive: true,
      nextDueDate: { gte: now, lte: cutoff },
    },
    include: {
      account: { select: { id: true, name: true } },
    },
    orderBy: { nextDueDate: "asc" },
  })

  return bills.map((b) => {
    const dueDate = new Date(b.nextDueDate)
    const diffTime = dueDate.getTime() - now.getTime()
    const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return {
      id: b.id,
      name: b.name,
      amount: toNumber(b.amount),
      frequency: b.frequency,
      dayOfMonth: b.dayOfMonth,
      isVariableAmount: b.isVariableAmount,
      category: b.category,
      nextDueDate: b.nextDueDate,
      daysUntilDue,
      account: b.account,
    }
  })
}

/**
 * Confirms a pending variable bill transaction with the actual amount.
 *
 * Variable bills generate transactions with notes="PENDING_CONFIRMATION".
 * This action updates the transaction's amount and clears the pending flag,
 * then adjusts the account balance for the difference.
 *
 * @param transactionId - The ID of the pending transaction to confirm
 * @param actualAmount - The real amount (positive number; stored as negative expense)
 * @throws "Transaction not found" | "Transaction is not pending confirmation"
 */
export async function confirmVariableBill(transactionId: string, actualAmount: number) {
  const userId = await requireUserId()

  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
  })

  if (!transaction) throw new Error("Transaction not found")
  if (transaction.notes !== "PENDING_CONFIRMATION") {
    throw new Error("Transaction is not pending confirmation")
  }

  const oldAmount = toNumber(transaction.amount)
  const newAmount = -Math.abs(actualAmount) // Expenses stored as negative
  const difference = newAmount - oldAmount

  await prisma.$transaction(async (tx) => {
    // Update the transaction amount and clear the pending flag
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        amount: newAmount,
        notes: null,
      },
    })

    // Adjust account balance by the difference
    if (difference !== 0) {
      await tx.account.update({
        where: { id: transaction.accountId },
        data: {
          balance: { increment: difference },
        },
      })
    }
  })

  return { success: true }
}
