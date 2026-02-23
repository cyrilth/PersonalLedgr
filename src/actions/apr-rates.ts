"use server"

/**
 * Server actions for APR rate CRUD on credit card accounts.
 *
 * APR rates track per-transaction interest rates on credit cards. Each rate has
 * a type (STANDARD, INTRO, BALANCE_TRANSFER, etc.), an effective date, and an
 * optional expiration date. Rates are soft-deleted via `isActive = false`.
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
 * Returns all APR rates for a credit card account (active and inactive).
 *
 * Results are ordered active-first, then newest-first by effective date.
 * Each rate includes a count of transactions currently using that rate,
 * which helps users decide whether it's safe to deactivate.
 */
export async function getAprRates(accountId: string) {
  const userId = await requireUserId()

  // Verify account belongs to user and is a credit card
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
  })
  if (!account) throw new Error("Account not found")
  if (account.type !== "CREDIT_CARD") {
    throw new Error("APR rates are only available for credit card accounts")
  }

  const rates = await prisma.aprRate.findMany({
    where: { accountId },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: [{ isActive: "desc" }, { effectiveDate: "desc" }],
  })

  // Serialize Decimal fields before crossing the server action boundary
  return rates.map((r) => ({
    id: r.id,
    rateType: r.rateType,
    apr: toNumber(r.apr),
    effectiveDate: r.effectiveDate,
    expirationDate: r.expirationDate,
    description: r.description,
    isActive: r.isActive,
    transactionCount: r._count.transactions,
  }))
}

/**
 * Creates a new APR rate on a credit card account.
 *
 * Validates that the target account is a credit card and that the APR value
 * is non-negative. Rates are always created as active; use deleteAprRate()
 * to deactivate. The APR is stored as a decimal fraction (e.g. 0.2499 = 24.99%).
 */
export async function createAprRate(data: {
  accountId: string
  rateType: string
  apr: number
  effectiveDate: Date | string
  expirationDate?: Date | string | null
  description?: string
}) {
  const userId = await requireUserId()

  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
  })
  if (!account) throw new Error("Account not found")
  if (account.type !== "CREDIT_CARD") {
    throw new Error("APR rates are only available for credit card accounts")
  }

  if (data.apr < 0) throw new Error("APR must be zero or positive")

  const rate = await prisma.aprRate.create({
    data: {
      accountId: data.accountId,
      rateType: data.rateType as "STANDARD" | "INTRO" | "BALANCE_TRANSFER" | "CASH_ADVANCE" | "PENALTY" | "PROMOTIONAL",
      apr: data.apr,
      effectiveDate: new Date(data.effectiveDate),
      expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
      description: data.description || null,
      isActive: true,
    },
  })

  return {
    id: rate.id,
    rateType: rate.rateType,
    apr: toNumber(rate.apr),
    effectiveDate: rate.effectiveDate,
    expirationDate: rate.expirationDate,
    description: rate.description,
    isActive: rate.isActive,
  }
}

/**
 * Updates an existing APR rate with partial data.
 *
 * Only fields included in `data` are modified — omitted fields remain unchanged.
 * Ownership is verified by joining through the parent account's userId.
 * Returns the same generic "APR rate not found" error for both missing and
 * unauthorized rates to avoid leaking existence information.
 */
export async function updateAprRate(
  id: string,
  data: {
    rateType?: string
    apr?: number
    effectiveDate?: Date | string
    expirationDate?: Date | string | null
    description?: string
  }
) {
  const userId = await requireUserId()

  const existing = await prisma.aprRate.findFirst({
    where: { id },
    include: { account: { select: { userId: true } } },
  })
  if (!existing) throw new Error("APR rate not found")
  if (existing.account.userId !== userId) throw new Error("APR rate not found")

  if (data.apr !== undefined && data.apr < 0) {
    throw new Error("APR must be zero or positive")
  }

  // Only include fields that were explicitly provided (partial update)
  const updateData: Record<string, unknown> = {}
  if (data.rateType !== undefined) updateData.rateType = data.rateType
  if (data.apr !== undefined) updateData.apr = data.apr
  if (data.effectiveDate !== undefined) updateData.effectiveDate = new Date(data.effectiveDate)
  if (data.expirationDate !== undefined) {
    updateData.expirationDate = data.expirationDate ? new Date(data.expirationDate) : null
  }
  if (data.description !== undefined) updateData.description = data.description || null

  const rate = await prisma.aprRate.update({
    where: { id },
    data: updateData,
  })

  return {
    id: rate.id,
    rateType: rate.rateType,
    apr: toNumber(rate.apr),
    effectiveDate: rate.effectiveDate,
    expirationDate: rate.expirationDate,
    description: rate.description,
    isActive: rate.isActive,
  }
}

/**
 * Soft-deletes an APR rate by setting `isActive = false`.
 *
 * Rates are never hard-deleted because existing transactions may reference
 * them via `aprRateId`. Deactivated rates no longer appear in the active
 * rate selector but remain visible in the management table for audit purposes.
 */
export async function deleteAprRate(id: string) {
  const userId = await requireUserId()

  const existing = await prisma.aprRate.findFirst({
    where: { id },
    include: { account: { select: { userId: true } } },
  })
  if (!existing) throw new Error("APR rate not found")
  if (existing.account.userId !== userId) throw new Error("APR rate not found")

  await prisma.aprRate.update({
    where: { id },
    data: { isActive: false },
  })

  return { success: true }
}
