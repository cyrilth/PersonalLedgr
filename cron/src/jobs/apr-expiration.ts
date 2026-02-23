/**
 * APR Rate Expiration Cleanup Job
 *
 * Runs daily at midnight. Finds all AprRate records whose expirationDate has
 * passed and marks them inactive. Any transactions still referencing an expired
 * rate are reassigned to the account's active STANDARD rate; if no such rate
 * exists the aprRateId is cleared so the transaction is no longer tied to a
 * stale rate.
 *
 * All mutations for a given expired rate are wrapped in a single Prisma
 * interactive transaction to ensure atomicity — either the rate is deactivated
 * and its transactions are reassigned together, or nothing changes.
 */

import { prisma } from "../db.js"

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns midnight at the start of today in UTC (i.e., 00:00:00.000Z for the
 * current calendar date). The comparison uses `lte` so a rate whose
 * expirationDate is exactly today is treated as expired.
 */
function startOfTodayUtc(): Date {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

// ── Main Job ──────────────────────────────────────────────────────────────────

/**
 * Deactivates expired APR rates and reassigns their linked transactions.
 *
 * For each expired rate:
 * 1. The rate's `isActive` flag is set to `false`.
 * 2. Transactions pointing to that rate are moved to the account's active
 *    STANDARD rate, or their `aprRateId` is set to `null` when no such
 *    fallback exists.
 *
 * Wrapped in a single database transaction per expired rate for atomicity.
 */
export async function runAprExpiration(): Promise<void> {
  console.log("[apr-expiration] Job started")

  const today = startOfTodayUtc()

  // ── Find expired rates ────────────────────────────────────────────────────

  const expiredRates = await prisma.aprRate.findMany({
    where: {
      isActive: true,
      expirationDate: { lte: today },
    },
    select: {
      id: true,
      accountId: true,
      rateType: true,
      apr: true,
      expirationDate: true,
    },
  })

  if (expiredRates.length === 0) {
    console.log("[apr-expiration] No expired APR rates found. Nothing to do.")
    return
  }

  console.log(
    `[apr-expiration] Found ${expiredRates.length} expired rate(s) to process`,
  )

  // ── Process each expired rate ─────────────────────────────────────────────

  let totalDeactivated = 0
  let totalReassigned = 0
  let totalCleared = 0

  for (const expiredRate of expiredRates) {
    const expiredOnLabel = expiredRate.expirationDate
      ? expiredRate.expirationDate.toISOString().slice(0, 10)
      : "unknown"

    console.log(
      `[apr-expiration] Processing rate ${expiredRate.id} ` +
        `(${expiredRate.rateType}, ${expiredRate.apr}% APR, ` +
        `expired ${expiredOnLabel}) on account ${expiredRate.accountId}`,
    )

    await prisma.$transaction(async (tx) => {
      // 1. Deactivate the expired rate
      await tx.aprRate.update({
        where: { id: expiredRate.id },
        data: { isActive: false },
      })

      // 2. Count transactions that reference this rate
      const affectedCount = await tx.transaction.count({
        where: { aprRateId: expiredRate.id },
      })

      if (affectedCount === 0) {
        console.log(
          `[apr-expiration]   Rate ${expiredRate.id}: deactivated, ` +
            `no transactions to reassign`,
        )
        totalDeactivated++
        return
      }

      // 3. Find the account's active STANDARD fallback rate
      const standardRate = await tx.aprRate.findFirst({
        where: {
          accountId: expiredRate.accountId,
          rateType: "STANDARD",
          isActive: true,
        },
        select: { id: true, apr: true },
      })

      if (standardRate) {
        // Reassign all affected transactions to the standard rate
        const { count } = await tx.transaction.updateMany({
          where: { aprRateId: expiredRate.id },
          data: { aprRateId: standardRate.id },
        })

        console.log(
          `[apr-expiration]   Rate ${expiredRate.id}: deactivated, ` +
            `${count} transaction(s) reassigned to standard rate ` +
            `${standardRate.id} (${standardRate.apr}% APR)`,
        )
        totalReassigned += count
      } else {
        // No active standard rate — clear the reference
        const { count } = await tx.transaction.updateMany({
          where: { aprRateId: expiredRate.id },
          data: { aprRateId: null },
        })

        console.log(
          `[apr-expiration]   Rate ${expiredRate.id}: deactivated, ` +
            `${count} transaction(s) cleared (no active STANDARD rate on account ` +
            `${expiredRate.accountId})`,
        )
        totalCleared += count
      }

      totalDeactivated++
    })
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log(
    `[apr-expiration] Job complete. ` +
      `Deactivated: ${totalDeactivated} rate(s). ` +
      `Transactions reassigned: ${totalReassigned}. ` +
      `Transactions cleared: ${totalCleared}.`,
  )
}
