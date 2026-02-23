/**
 * Credit Card Daily Interest Accrual Job
 *
 * Runs every day at midnight. For each active credit card account that has
 * CreditCardDetails configured, this job:
 *
 * 1. Loads all EXPENSE transactions on the card (the outstanding "purchases").
 * 2. Determines which transactions should actually accrue interest today,
 *    respecting the grace period: if the prior statement was paid in full,
 *    purchases made within the current billing cycle are interest-free.
 * 3. Computes each transaction's daily periodic rate:
 *      daily interest = |amount| × (APR / 100 / 365)
 *    and sums them into a total daily accrual figure.
 * 4. Writes an InterestLog row (type CHARGED) every day with the accrual amount.
 * 5. On the last calendar day of the month, also posts an INTEREST_CHARGED
 *    Transaction and updates the account balance so the accrued interest
 *    becomes visible to the user.
 *
 * All writes for a single account are wrapped in a Prisma interactive transaction
 * to ensure atomicity — a partial write cannot leave the database in an
 * inconsistent state.
 */

import Decimal from "decimal.js"
import { prisma } from "../db.js"
import type {
  AprRate,
  CreditCardDetails,
  Transaction,
} from "@prisma/client"

// ── Types ────────────────────────────────────────────────────────────────────

/** A credit card account row joined with its details and APR rates. */
type CreditCardAccount = {
  id: string
  userId: string
  name: string
  balance: Decimal
  isActive: boolean
  creditCardDetails: CreditCardDetails
  aprRates: AprRate[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the most recent statement close date that is strictly in the past
 * (i.e., on or before today), given the card's `statementCloseDay`.
 *
 * Examples (statementCloseDay = 15):
 *   today = Feb 20  → Feb 15 of the same month
 *   today = Feb 10  → Jan 15 of the previous month
 *   today = Feb 15  → Feb 15 of the same month (close day is today itself)
 */
function getLastStatementCloseDate(
  today: Date,
  statementCloseDay: number
): Date {
  const year = today.getFullYear()
  const month = today.getMonth() // 0-based
  const day = today.getDate()

  if (day >= statementCloseDay) {
    // Close day already passed (or is today) this month
    return new Date(year, month, statementCloseDay, 0, 0, 0, 0)
  } else {
    // Close day hasn't arrived yet — use previous month
    return new Date(year, month - 1, statementCloseDay, 0, 0, 0, 0)
  }
}

/**
 * Determines whether a transaction should accrue interest today.
 *
 * Grace period rule: when the last statement was paid in full, all purchases
 * that were posted AFTER the most recent statement close date are within the
 * current billing cycle and are interest-free. Purchases from prior cycles
 * still accrue interest.
 *
 * When the last statement was NOT paid in full, interest accrues on every
 * outstanding purchase regardless of when it was made.
 *
 * @param txDate        - The date the purchase transaction was posted.
 * @param ccDetails     - CreditCardDetails row for this account.
 * @param today         - The current date (injected for testability).
 */
function shouldChargeInterest(
  txDate: Date,
  ccDetails: CreditCardDetails,
  today: Date
): boolean {
  // If the previous statement was not paid in full, every purchase accrues.
  if (!ccDetails.lastStatementPaidInFull) {
    return true
  }

  // Grace period in effect: only charge interest on purchases from PRIOR cycles.
  const lastClose = getLastStatementCloseDate(today, ccDetails.statementCloseDay)

  // A purchase is in the *current* billing cycle if it was posted strictly
  // after the most recent statement close date.
  const isCurrentCyclePurchase = txDate > lastClose

  // Current-cycle purchases are covered by the grace period → no interest.
  return !isCurrentCyclePurchase
}

/**
 * Returns the effective APR (as a Decimal) for a given transaction.
 *
 * Priority:
 *   1. The APR rate explicitly linked to the transaction (aprRateId).
 *   2. The account's active STANDARD rate (fallback).
 *   3. `null` if neither is found — caller should skip this transaction.
 *
 * @param transaction    - The expense transaction being evaluated.
 * @param accountAprRates - All AprRate rows loaded for the account.
 */
function getEffectiveApr(
  transaction: Transaction,
  accountAprRates: AprRate[]
): Decimal | null {
  // 1. Transaction-level APR (e.g., a specific promotional or intro rate)
  if (transaction.aprRateId) {
    const linked = accountAprRates.find((r) => r.id === transaction.aprRateId)
    if (linked && linked.isActive) {
      return linked.apr
    }
  }

  // 2. Fall back to the account's active STANDARD rate
  const standard = accountAprRates.find(
    (r) => r.rateType === "STANDARD" && r.isActive
  )
  return standard ? standard.apr : null
}

/**
 * Returns `true` if the given date is the last calendar day of its month.
 *
 * @param date - The date to test.
 */
function isLastDayOfMonth(date: Date): boolean {
  // Setting day = 0 of next month rolls back to the last day of `date`'s month.
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return date.getDate() === lastDay
}

/**
 * Formats a Decimal as a US dollar string for log output.
 * e.g. Decimal("1.2345") → "$1.23"
 */
function formatUsd(value: Decimal): string {
  return `$${value.toFixed(2)}`
}

// ── Main Job ─────────────────────────────────────────────────────────────────

/**
 * Entry point for the daily credit card interest accrual job.
 *
 * Called by `cron/src/index.ts` on a `0 0 * * *` (midnight) schedule.
 * Iterates over every active credit card account, computes the day's interest
 * accrual, writes an InterestLog row, and — on the last day of the month —
 * posts the cumulative monthly interest as a Transaction and adjusts the
 * account balance.
 */
export async function runCCInterestAccrual(): Promise<void> {
  const today = new Date()
  // Normalise to midnight local time so date comparisons are day-boundary safe.
  today.setHours(0, 0, 0, 0)

  console.log(`[interest-cc] Starting CC interest accrual for ${today.toISOString().slice(0, 10)}`)

  // ── 1. Load all active credit card accounts ──────────────────────────────

  const accounts = await prisma.account.findMany({
    where: {
      type: "CREDIT_CARD",
      isActive: true,
      creditCardDetails: { isNot: null },
    },
    include: {
      creditCardDetails: true,
      aprRates: {
        where: { isActive: true },
      },
    },
  }) as CreditCardAccount[]

  if (accounts.length === 0) {
    console.log("[interest-cc] No active credit card accounts found. Nothing to do.")
    return
  }

  console.log(`[interest-cc] Processing ${accounts.length} credit card account(s)`)

  const monthEnd = isLastDayOfMonth(today)

  let processedCount = 0
  let skippedCount = 0

  // ── 2. Process each account ──────────────────────────────────────────────

  for (const account of accounts) {
    const ccDetails = account.creditCardDetails

    try {
      // Load all EXPENSE transactions on this card
      const expenses = await prisma.transaction.findMany({
        where: {
          accountId: account.id,
          type: "EXPENSE",
        },
        orderBy: { date: "asc" },
      })

      if (expenses.length === 0) {
        console.log(`[interest-cc] Account "${account.name}" (${account.id}): no expense transactions, skipping`)
        skippedCount++
        continue
      }

      // ── 3. Calculate daily accrual for this account ──────────────────────

      let totalDailyInterest = new Decimal(0)
      let interestingTxCount = 0

      for (const tx of expenses) {
        const txDate = new Date(tx.date)
        txDate.setHours(0, 0, 0, 0)

        if (!shouldChargeInterest(txDate, ccDetails, today)) {
          continue
        }

        const effectiveApr = getEffectiveApr(tx, account.aprRates)

        if (effectiveApr === null) {
          console.warn(
            `[interest-cc] Account "${account.name}" (${account.id}): ` +
            `transaction ${tx.id} has no applicable APR rate — skipping this transaction`
          )
          continue
        }

        // Daily periodic rate: APR% / 100 / 365
        // Amount is stored as negative for expenses (debit); use abs value.
        const principal = tx.amount.abs()
        const dailyRate = effectiveApr.div(new Decimal(100)).div(new Decimal(365))
        const dailyInterest = principal.mul(dailyRate)

        totalDailyInterest = totalDailyInterest.add(dailyInterest)
        interestingTxCount++
      }

      if (totalDailyInterest.isZero()) {
        console.log(
          `[interest-cc] Account "${account.name}" (${account.id}): ` +
          `${expenses.length} expense(s) evaluated, none subject to interest today`
        )
        skippedCount++
        continue
      }

      const logNotes =
        `Daily accrual: ${formatUsd(totalDailyInterest)} on ${interestingTxCount} ` +
        `transaction(s). Date: ${today.toISOString().slice(0, 10)}`

      // ── 4. Write to database (atomic) ────────────────────────────────────

      await prisma.$transaction(async (tx) => {
        // Always write a daily InterestLog entry
        await tx.interestLog.create({
          data: {
            date: today,
            amount: totalDailyInterest,
            type: "CHARGED",
            notes: logNotes,
            userId: account.userId,
            accountId: account.id,
          },
        })

        // On the last day of the month: post an INTEREST_CHARGED Transaction
        // and debit the account balance.
        if (monthEnd) {
          // Sum all CHARGED InterestLog entries for this account in the current month
          // to determine the full monthly interest amount to post.
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0)

          const monthlyLogs = await tx.interestLog.findMany({
            where: {
              accountId: account.id,
              type: "CHARGED",
              date: {
                gte: monthStart,
                lte: today,
              },
            },
            select: { amount: true },
          })

          const monthlyTotal = monthlyLogs.reduce(
            (sum, log) => sum.add(log.amount),
            new Decimal(0)
          )

          const monthLabel = today.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })

          // Post the interest charge as a Transaction (negative = debit for CC)
          await tx.transaction.create({
            data: {
              date: today,
              description: `Interest Charge — ${monthLabel}`,
              amount: monthlyTotal.negated(),
              type: "INTEREST_CHARGED",
              category: "Interest",
              source: "SYSTEM",
              notes: `Monthly interest posted on ${today.toISOString().slice(0, 10)}. Daily accruals summed from ${monthStart.toISOString().slice(0, 10)} to ${today.toISOString().slice(0, 10)}.`,
              userId: account.userId,
              accountId: account.id,
            },
          })

          // Debit the account balance (CC balance is stored as negative; subtract interest)
          await tx.account.update({
            where: { id: account.id },
            data: {
              balance: {
                decrement: monthlyTotal,
              },
            },
          })

          console.log(
            `[interest-cc] Account "${account.name}" (${account.id}): ` +
            `month-end — posted INTEREST_CHARGED transaction of ${formatUsd(monthlyTotal)} ` +
            `and updated balance`
          )
        }
      })

      console.log(
        `[interest-cc] Account "${account.name}" (${account.id}): ` +
        `logged daily accrual of ${formatUsd(totalDailyInterest)} ` +
        `(${interestingTxCount} transaction(s))`
      )
      processedCount++
    } catch (err) {
      // Log the error for this account but continue processing the rest.
      console.error(
        `[interest-cc] Account "${account.name}" (${account.id}): ` +
        `error during accrual — skipping this account`,
        err
      )
      skippedCount++
    }
  }

  console.log(
    `[interest-cc] Done. Processed: ${processedCount}, Skipped/no-interest: ${skippedCount}`
  )
}
