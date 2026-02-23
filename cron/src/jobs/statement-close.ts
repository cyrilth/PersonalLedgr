/**
 * Statement Close Job — Daily credit card statement cycle processing.
 *
 * Runs at midnight every day. For each credit card whose `statementCloseDay`
 * matches today's day-of-month, this job:
 *
 *   1. Snapshots the current account balance to `lastStatementBalance`.
 *   2. Sums all payment/credit transactions posted since the previous statement
 *      close date (one month prior on the same day-of-month).
 *   3. Compares those payments to the absolute value of the previous statement
 *      balance to determine whether the prior statement was paid in full.
 *   4. Persists both values atomically via a Prisma transaction.
 *
 * "Payment" in this context means any transaction posted to the credit card
 * account that carries a positive amount — these are credits that reduce the
 * card's negative balance (INCOME, TRANSFER, or INTEREST_EARNED with a
 * positive amount).
 */

import { prisma } from "../db.js"

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the statement close date from the previous billing cycle.
 *
 * The previous close date is the same day-of-month as the current close, but
 * one calendar month earlier. If that day does not exist in the prior month
 * (e.g., closeDay=31 in a 30-day month), JavaScript's Date arithmetic
 * naturally rolls over — we clamp to the last day of that month instead.
 *
 * @param closeDay  - The `statementCloseDay` from CreditCardDetails (1–31).
 * @param reference - The reference date to step back from (default: today).
 * @returns A Date set to midnight UTC on the previous statement close date.
 */
function getPreviousStatementDate(closeDay: number, reference: Date = new Date()): Date {
  const year = reference.getUTCFullYear()
  const month = reference.getUTCMonth() // 0-indexed

  // Step back one month
  const prevYear = month === 0 ? year - 1 : year
  const prevMonth = month === 0 ? 11 : month - 1

  // Determine the last day of the previous month
  const daysInPrevMonth = new Date(Date.UTC(prevYear, prevMonth + 1, 0)).getUTCDate()

  // Clamp closeDay to what actually existed that month
  const day = Math.min(closeDay, daysInPrevMonth)

  return new Date(Date.UTC(prevYear, prevMonth, day))
}

// ── Main Job ─────────────────────────────────────────────────────────────────

/**
 * Processes daily credit card statement closes.
 *
 * Finds every active credit card account whose `statementCloseDay` equals
 * today's UTC day-of-month, then updates `lastStatementBalance` and
 * `lastStatementPaidInFull` on each. Each account update runs inside its own
 * database transaction to ensure atomicity.
 */
export async function runStatementClose(): Promise<void> {
  const now = new Date()
  const todayDay = now.getUTCDate()

  console.log(`[statement-close] Job started — today is day ${todayDay} of the month (UTC)`)

  // Find all active CC accounts whose statement closes today
  const dueAccounts = await prisma.creditCardDetails.findMany({
    where: {
      statementCloseDay: todayDay,
      account: { isActive: true },
    },
    include: {
      account: {
        select: { id: true, name: true, balance: true },
      },
    },
  })

  if (dueAccounts.length === 0) {
    console.log("[statement-close] No credit card statements closing today. Nothing to do.")
    return
  }

  console.log(`[statement-close] Found ${dueAccounts.length} statement(s) to close.`)

  let processed = 0
  let failed = 0

  for (const details of dueAccounts) {
    const { account, statementCloseDay, lastStatementBalance } = details
    const accountLabel = `${account.name} (${account.id})`

    try {
      // The window for payment detection: previous close date up to now
      const prevCloseDate = getPreviousStatementDate(statementCloseDay, now)

      // Sum all positive-amount transactions on this account since the last
      // statement close — these represent payments and credits to the card.
      const paymentsAgg = await prisma.transaction.aggregate({
        where: {
          accountId: account.id,
          date: { gte: prevCloseDate },
          amount: { gt: 0 },
          type: {
            in: ["INCOME", "TRANSFER", "INTEREST_EARNED"],
          },
        },
        _sum: { amount: true },
      })

      const totalPayments = Number(paymentsAgg._sum.amount ?? 0)
      const prevStatementOwed = Math.abs(Number(lastStatementBalance))

      // Grace period is honoured when payments fully cover the prior balance.
      // If the prior balance was zero, treat it as paid in full.
      const paidInFull = prevStatementOwed === 0 || totalPayments >= prevStatementOwed

      const newStatementBalance = Number(account.balance)

      await prisma.$transaction(async (tx) => {
        await tx.creditCardDetails.update({
          where: { accountId: account.id },
          data: {
            lastStatementBalance: newStatementBalance,
            lastStatementPaidInFull: paidInFull,
          },
        })
      })

      console.log(
        `[statement-close] Closed statement for ${accountLabel}: ` +
          `balance=${newStatementBalance.toFixed(2)}, ` +
          `prevOwed=${prevStatementOwed.toFixed(2)}, ` +
          `payments=${totalPayments.toFixed(2)}, ` +
          `paidInFull=${paidInFull}`,
      )

      processed++
    } catch (err) {
      console.error(`[statement-close] Failed to close statement for ${accountLabel}:`, err)
      failed++
    }
  }

  console.log(
    `[statement-close] Job complete — processed: ${processed}, failed: ${failed}.`,
  )
}
