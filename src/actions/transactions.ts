"use server"

/**
 * Server actions for transaction CRUD and bulk operations.
 *
 * Amounts are signed: positive = credit (income), negative = debit (expense).
 * Account balances are updated atomically on every create/update/delete via
 * Prisma interactive transactions. Transfer pairs (linked via linkedTransactionId)
 * are deleted together to keep both accounts consistent.
 *
 * Key invariants:
 * - Prisma Decimal → toNumber() before returning across the server action boundary
 * - Balance changes always happen inside $transaction for atomicity
 * - Transfers use TRANSFER type and are never counted as income/expense
 */

import { headers } from "next/headers"
import { prisma } from "@/db"
import { auth } from "@/lib/auth"

// ── Helpers ──────────────────────────────────────────────────────────

/** Extracts the authenticated user's ID from the session cookie. */
async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("Unauthorized")
  return session.user.id
}

/** Convert Prisma Decimal to a plain JS number for serialization. */
function toNumber(d: unknown): number {
  return Number(d)
}

// ── Server Actions ───────────────────────────────────────────────────

/**
 * Returns a paginated, filtered list of the user's transactions.
 *
 * All filter fields are optional — omitting them returns all transactions.
 * Includes the parent account summary (id, name, type) for display.
 * Results are ordered newest-first.
 */
export async function getTransactions(filters: {
  accountId?: string
  type?: string | string[]
  category?: string
  dateFrom?: Date | string
  dateTo?: Date | string
  search?: string
  owner?: string
  page?: number
  pageSize?: number
} = {}) {
  const userId = await requireUserId()

  const page = filters.page ?? 1
  const pageSize = filters.pageSize ?? 50

  // Build dynamic where clause
  const where: Record<string, unknown> = { userId }

  if (filters.accountId) {
    where.accountId = filters.accountId
  }

  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type]
    where.type = { in: types }
  }

  if (filters.category) {
    where.category = filters.category
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Record<string, unknown> = {}
    if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom)
    if (filters.dateTo) dateFilter.lte = new Date(filters.dateTo)
    where.date = dateFilter
  }

  if (filters.search) {
    where.description = { contains: filters.search, mode: "insensitive" }
  }

  if (filters.owner) {
    where.account = { owner: filters.owner }
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        account: { select: { id: true, name: true, type: true } },
      },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ])

  return {
    transactions: transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amount: toNumber(t.amount),
      type: t.type,
      category: t.category,
      source: t.source,
      notes: t.notes,
      accountId: t.accountId,
      account: t.account,
      linkedTransactionId: t.linkedTransactionId,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

/**
 * Creates a transaction and updates the parent account's balance atomically.
 *
 * The amount is added to the account balance via `increment` — positive amounts
 * increase the balance (income/credit), negative amounts decrease it (expense/debit).
 * Source defaults to MANUAL when not specified (e.g. from the transaction form).
 */
export async function createTransaction(data: {
  date: Date | string
  description: string
  amount: number
  type: string
  category?: string
  notes?: string
  accountId: string
  source?: string
  aprRateId?: string
}) {
  const userId = await requireUserId()

  // Verify account ownership
  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
  })
  if (!account) throw new Error("Account not found")

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        date: new Date(data.date),
        description: data.description,
        amount: data.amount,
        type: data.type as "INCOME" | "EXPENSE" | "TRANSFER" | "LOAN_PRINCIPAL" | "LOAN_INTEREST" | "INTEREST_EARNED" | "INTEREST_CHARGED",
        category: data.category || null,
        notes: data.notes || null,
        source: (data.source as "MANUAL" | "IMPORT" | "PLAID" | "RECURRING" | "SYSTEM") ?? "MANUAL",
        userId,
        accountId: data.accountId,
        aprRateId: data.aprRateId || null,
      },
    })

    await tx.account.update({
      where: { id: data.accountId },
      data: { balance: { increment: data.amount } },
    })

    return transaction
  })

  return {
    id: result.id,
    date: result.date,
    description: result.description,
    amount: toNumber(result.amount),
    type: result.type,
    category: result.category,
    source: result.source,
    notes: result.notes,
    accountId: result.accountId,
  }
}

/**
 * Updates a transaction and adjusts account balances atomically.
 *
 * Balance correction uses a reverse-then-apply strategy:
 * 1. Decrement the old amount from the old account (undo)
 * 2. Increment the new amount on the new account (apply)
 *
 * Supports moving a transaction between accounts — when accountId changes,
 * the new account's ownership is verified before proceeding.
 * Does NOT cascade to a linked transfer partner; each side is updated independently.
 */
export async function updateTransaction(
  id: string,
  data: {
    date?: Date | string
    description?: string
    amount?: number
    type?: string
    category?: string
    notes?: string
    accountId?: string
  }
) {
  const userId = await requireUserId()

  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
  })
  if (!existing) throw new Error("Transaction not found")

  const oldAmount = toNumber(existing.amount)
  const newAmount = data.amount ?? oldAmount
  const oldAccountId = existing.accountId
  const newAccountId = data.accountId ?? oldAccountId
  const accountChanged = newAccountId !== oldAccountId

  // If moving to a different account, verify ownership of the new account
  if (accountChanged) {
    const newAccount = await prisma.account.findFirst({
      where: { id: newAccountId, userId },
    })
    if (!newAccount) throw new Error("Account not found")
  }

  // Only include fields that were explicitly provided (partial update)
  const updateData: Record<string, unknown> = {}
  if (data.date !== undefined) updateData.date = new Date(data.date)
  if (data.description !== undefined) updateData.description = data.description
  if (data.amount !== undefined) updateData.amount = data.amount
  if (data.type !== undefined) updateData.type = data.type
  if (data.category !== undefined) updateData.category = data.category || null
  if (data.notes !== undefined) updateData.notes = data.notes || null
  if (data.accountId !== undefined) updateData.accountId = data.accountId

  const result = await prisma.$transaction(async (tx) => {
    // Reverse old balance impact on old account
    await tx.account.update({
      where: { id: oldAccountId },
      data: { balance: { decrement: oldAmount } },
    })

    // Apply new balance impact on new (or same) account
    await tx.account.update({
      where: { id: newAccountId },
      data: { balance: { increment: newAmount } },
    })

    // Update the transaction record
    const updated = await tx.transaction.update({
      where: { id },
      data: updateData,
    })

    return updated
  })

  return {
    id: result.id,
    date: result.date,
    description: result.description,
    amount: toNumber(result.amount),
    type: result.type,
    category: result.category,
    source: result.source,
    notes: result.notes,
    accountId: result.accountId,
  }
}

/**
 * Deletes a transaction and reverses its balance impact atomically.
 *
 * For transfer pairs (linked via linkedTransactionId): both sides are deleted
 * together and both account balances are reversed. The FK link is broken first
 * to satisfy the unique constraint before deletion.
 *
 * The self-referential relation has two sides — `linkedTransaction` (this record
 * holds the FK) and `linkedBy` (the other record points to this one). We check
 * both to find the partner regardless of which side is being deleted.
 */
export async function deleteTransaction(id: string) {
  const userId = await requireUserId()

  const existing = await prisma.transaction.findFirst({
    where: { id, userId },
    include: { linkedTransaction: true, linkedBy: true },
  })
  if (!existing) throw new Error("Transaction not found")

  // Determine linked partner (either side of the self-referential relation)
  const linkedPartner = existing.linkedTransaction ?? existing.linkedBy ?? null

  await prisma.$transaction(async (tx) => {
    if (linkedPartner) {
      // Transfer pair: delete both sides
      // Break the FK link first by nulling linkedTransactionId on the linking side
      if (existing.linkedTransactionId) {
        await tx.transaction.update({
          where: { id: existing.id },
          data: { linkedTransactionId: null },
        })
      } else {
        await tx.transaction.update({
          where: { id: linkedPartner.id },
          data: { linkedTransactionId: null },
        })
      }

      // Reverse balance on both accounts
      await tx.account.update({
        where: { id: existing.accountId },
        data: { balance: { decrement: toNumber(existing.amount) } },
      })
      await tx.account.update({
        where: { id: linkedPartner.accountId },
        data: { balance: { decrement: toNumber(linkedPartner.amount) } },
      })

      // Delete both transactions
      await tx.transaction.delete({ where: { id: existing.id } })
      await tx.transaction.delete({ where: { id: linkedPartner.id } })
    } else {
      // Standalone transaction
      await tx.account.update({
        where: { id: existing.accountId },
        data: { balance: { decrement: toNumber(existing.amount) } },
      })
      await tx.transaction.delete({ where: { id } })
    }
  })

  return { success: true }
}

/**
 * Updates the category on multiple transactions at once.
 *
 * No balance impact — category is metadata only. Scoped to the current user
 * so a user cannot re-categorize another user's transactions.
 */
export async function bulkCategorize(ids: string[], category: string) {
  const userId = await requireUserId()

  const result = await prisma.transaction.updateMany({
    where: { id: { in: ids }, userId },
    data: { category },
  })

  return { count: result.count }
}
