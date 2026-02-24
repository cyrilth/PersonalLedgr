/**
 * Daily Recurring Bill Auto-Generation Job
 *
 * Runs every day at 6 AM. For each active RecurringBill whose `nextDueDate`
 * is on or before today, this job generates the corresponding Transaction and
 * advances the bill's `nextDueDate` to the next occurrence.
 *
 * Behaviour per bill type:
 *
 *   Fixed amount (isVariableAmount = false)
 *     - Creates an EXPENSE transaction with the bill's exact amount (stored
 *       as a negative value, consistent with the convention for debits).
 *     - Decrements the linked account's balance by the bill amount.
 *     - source = RECURRING
 *
 *   Variable amount (isVariableAmount = true)
 *     - Creates an EXPENSE transaction with the bill's estimated amount
 *       (stored as negative) but does NOT adjust the account balance — the
 *       balance will be updated when the user confirms the actual amount.
 *     - source = RECURRING
 *     - notes = "PENDING_CONFIRMATION" so the UI can surface it for review.
 *
 * Both cases:
 *   - The bill's `nextDueDate` is advanced to the next calendar occurrence
 *     after today, using JavaScript's Date constructor overflow behaviour to
 *     handle month-length differences correctly.
 *   - If a bill is past-due (nextDueDate in the past), exactly ONE
 *     transaction is generated and the due date is fast-forwarded past today.
 *
 * Atomicity: all writes for a single bill (transaction creation + optional
 * balance update + nextDueDate advance) are wrapped in a Prisma interactive
 * transaction so they succeed or fail as a unit.
 *
 * Error isolation: per-bill errors are caught and logged without aborting
 * processing of other bills.
 *
 * @module jobs/recurring-bills
 */

import Decimal from "decimal.js"
import { prisma } from "../db.js"
import type { RecurringBill } from "@prisma/client"

// ── Types ─────────────────────────────────────────────────────────────────────

/** The subset of RecurringBill fields used during processing. */
type BillRecord = Pick<
  RecurringBill,
  | "id"
  | "name"
  | "amount"
  | "frequency"
  | "dayOfMonth"
  | "isVariableAmount"
  | "category"
  | "nextDueDate"
  | "userId"
  | "accountId"
>

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalises a Date to midnight (00:00:00.000) local time so that all
 * day-boundary comparisons operate on calendar dates rather than instants.
 *
 * @param date - The date to normalise (mutated in place and returned).
 * @returns The same Date with its time portion zeroed.
 */
function toMidnight(date: Date): Date {
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Returns today's date normalised to midnight local time.
 */
function today(): Date {
  return toMidnight(new Date())
}

/**
 * Advances a due date by one occurrence of the given frequency.
 *
 * Uses `new Date(year, month + N, day)` which correctly overflows into the
 * next month (e.g. March 31 + 1 month → April 30, not an invalid date).
 *
 * @param from      - The current due date.
 * @param frequency - The bill's recurrence interval.
 * @param day       - The desired day-of-month for the next occurrence.
 * @returns A new Date representing the next occurrence.
 */
function advanceByOneOccurrence(
  from: Date,
  frequency: RecurringBill["frequency"],
  day: number
): Date {
  const year = from.getFullYear()
  const month = from.getMonth() // 0-based

  switch (frequency) {
    case "WEEKLY": {
      const next = new Date(from)
      next.setDate(next.getDate() + 7)
      return toMidnight(next)
    }
    case "BIWEEKLY": {
      const next = new Date(from)
      next.setDate(next.getDate() + 14)
      return toMidnight(next)
    }
    case "MONTHLY":
      return toMidnight(new Date(year, month + 1, day))
    case "QUARTERLY":
      return toMidnight(new Date(year, month + 3, day))
    case "ANNUAL":
      return toMidnight(new Date(year, month + 12, day))
  }
}

/**
 * Advances `nextDueDate` past `todayDate` by repeatedly applying
 * `advanceByOneOccurrence`. For bills that are only one period behind, this
 * returns after a single advance. For bills that somehow fell multiple periods
 * behind, it keeps advancing until the next due date is strictly in the future.
 *
 * This ensures one transaction per run regardless of how stale the bill is.
 *
 * @param current   - The bill's current (past) nextDueDate.
 * @param frequency - The bill's recurrence interval.
 * @param day       - The day-of-month to use when computing occurrences.
 * @param todayDate - The reference "today" date (midnight local).
 * @returns The first future nextDueDate, strictly after todayDate.
 */
function computeNextDueDate(
  current: Date,
  frequency: RecurringBill["frequency"],
  day: number,
  todayDate: Date
): Date {
  let next = advanceByOneOccurrence(current, frequency, day)

  // Keep advancing if the computed next date is still in the past or today.
  while (next <= todayDate) {
    next = advanceByOneOccurrence(next, frequency, day)
  }

  return next
}

/**
 * Returns a stable ISO date string (YYYY-MM-DD) from a Date object.
 *
 * @param date - The date to format.
 */
function toDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// ── Main Job ──────────────────────────────────────────────────────────────────

/**
 * Entry point for the daily recurring bill generation job.
 *
 * Called by `cron/src/index.ts` on a `0 6 * * *` (6 AM) schedule.
 *
 * Queries all active RecurringBill records where `nextDueDate <= today`,
 * creates the corresponding EXPENSE Transaction, optionally updates the
 * account balance (fixed-amount bills only), and advances `nextDueDate` to
 * the next future occurrence — all within a single Prisma transaction per
 * bill.
 *
 * Logs a summary at completion: total processed, variable/pending count,
 * and failure count.
 */
export async function runRecurringBills(): Promise<void> {
  const todayDate = today()
  console.log(
    `[recurring-bills] Job started for ${toDateLabel(todayDate)}`,
  )

  // ── 1. Load due bills ────────────────────────────────────────────────────

  const dueBills: BillRecord[] = await prisma.recurringBill.findMany({
    where: {
      isActive: true,
      nextDueDate: { lte: todayDate },
    },
    select: {
      id: true,
      name: true,
      amount: true,
      frequency: true,
      dayOfMonth: true,
      isVariableAmount: true,
      category: true,
      nextDueDate: true,
      userId: true,
      accountId: true,
    },
  })

  if (dueBills.length === 0) {
    console.log("[recurring-bills] No bills due today. Nothing to do.")
    return
  }

  console.log(
    `[recurring-bills] Found ${dueBills.length} bill(s) due on or before ${toDateLabel(todayDate)}`,
  )

  // ── 2. Process each due bill ─────────────────────────────────────────────

  let processed = 0
  let variablePending = 0
  let failed = 0

  for (const bill of dueBills) {
    const dueDateLabel = toDateLabel(new Date(bill.nextDueDate))
    const amountDecimal = new Decimal(bill.amount.toString())
    // Amounts for expense transactions are stored as negative values.
    const negativeAmount = amountDecimal.abs().negated()
    const nextDueDate = computeNextDueDate(
      new Date(bill.nextDueDate),
      bill.frequency,
      bill.dayOfMonth,
      todayDate,
    )

    try {
      await prisma.$transaction(async (tx) => {
        if (bill.isVariableAmount) {
          // ── Variable amount: create a pending transaction, no balance change ──

          await tx.transaction.create({
            data: {
              date: new Date(bill.nextDueDate),
              description: bill.name,
              amount: negativeAmount.toString(),
              type: "EXPENSE",
              category: bill.category ?? undefined,
              source: "RECURRING",
              notes: "PENDING_CONFIRMATION",
              userId: bill.userId,
              accountId: bill.accountId,
            },
          })
          // BillPayment for variable bills is created when user confirms the amount
        } else {
          // ── Fixed amount: create transaction, update balance, record payment ──

          const dueDate = new Date(bill.nextDueDate)
          const createdTx = await tx.transaction.create({
            data: {
              date: dueDate,
              description: bill.name,
              amount: negativeAmount.toString(),
              type: "EXPENSE",
              category: bill.category ?? undefined,
              source: "RECURRING",
              userId: bill.userId,
              accountId: bill.accountId,
            },
          })

          await tx.account.update({
            where: { id: bill.accountId },
            data: {
              balance: {
                decrement: amountDecimal.abs().toString(),
              },
            },
          })

          // Create BillPayment record for the payment ledger
          await tx.billPayment.create({
            data: {
              month: dueDate.getMonth() + 1,
              year: dueDate.getFullYear(),
              amount: amountDecimal.abs().toString(),
              recurringBillId: bill.id,
              transactionId: createdTx.id,
            },
          })
        }

        // ── Advance nextDueDate to the next future occurrence ─────────────────

        await tx.recurringBill.update({
          where: { id: bill.id },
          data: { nextDueDate },
        })
      })

      const pendingNote = bill.isVariableAmount ? " (PENDING_CONFIRMATION)" : ""
      console.log(
        `[recurring-bills] OK    bill=${bill.id} ("${bill.name}") ` +
          `due=${dueDateLabel} amount=$${amountDecimal.abs().toFixed(2)}${pendingNote} ` +
          `nextDue=${toDateLabel(nextDueDate)}`,
      )

      processed++
      if (bill.isVariableAmount) variablePending++
    } catch (err) {
      console.error(
        `[recurring-bills] ERROR bill=${bill.id} ("${bill.name}") due=${dueDateLabel}:`,
        err,
      )
      failed++
    }
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────

  console.log(
    `[recurring-bills] Job complete. ` +
      `processed=${processed} variablePending=${variablePending} failed=${failed}`,
  )
}
