/**
 * Monthly Loan Deferment Interest Accrual Job
 *
 * Runs on the 1st of every month. For each active LOAN/MORTGAGE that is still
 * inside its no-payment deferment phase AND is unsubsidized (interest accrues),
 * this job capitalizes one month of interest into the loan's principal:
 *
 *   1. Re-reads the loan + account UNDER the transaction and recomputes the
 *      accrual window from the fresh start date / deferment length / watermark,
 *      so an edit committed between the snapshot query and the charge can't move
 *      money on stale data. It capitalizes |balance| × (interestRate / 100 / 12)
 *      for each whole month still owed, catching up months missed during a cron
 *      outage (compounded) — including the FINAL deferment month even if the run
 *      resumes after the window has ended. A loan with no prior accrual takes
 *      only the current month (its elapsed deferment is already in the balance).
 *   2. Atomically CLAIMS the month via a conditional `lastDefermentAccrual`
 *      update BEFORE moving any money — so a re-run, or two overlapping runs
 *      (e.g. the scheduled job and a manual CRON_RUN_NOW pass), can never
 *      double-capitalize. Under PostgreSQL Read Committed the row lock
 *      serializes racing transactions, so exactly one matches the claim.
 *   3. Conditionally GROWS THE DEBT with an `account.updateMany` guarded on the
 *      account still being negative. The loan-row claim in step 2 only proves the
 *      account was negative at claim time; a concurrent payoff could zero it
 *      between the balance read and here, and a plain relative decrement would
 *      then resurrect a paid-off loan to -interest. Guarding the debit on
 *      `balance < 0` re-checks the live balance under the row lock: zero rows
 *      matched ⇒ the account was paid off ⇒ throw to roll the whole transaction
 *      back (the watermark claim and the charge revert together).
 *   4. Posts an INTEREST_CHARGED transaction (negative = grows the debt). Created
 *      only after the conditional debit succeeds, so a rolled-back accrual leaves
 *      no charge behind.
 *
 * Why INTEREST_CHARGED and not LOAN_INTEREST: loan/mortgage balance
 * recalculation excludes LOAN_INTEREST (it never moves principal), so using it
 * here would leave the recalculate button reporting permanent drift.
 * INTEREST_CHARGED IS summed into the loan balance, keeping the ledger
 * consistent with the grown balance — the same type the CC accrual job posts.
 *
 * Why no InterestLog entry: the loan detail page sums InterestLog as "interest
 * PAID to date". Capitalized deferment interest is charged but NOT paid (it
 * becomes principal you repay later), so logging it there would overstate paid
 * interest. The INTEREST_CHARGED transaction still records the charge in the
 * ledger and in spending reports.
 *
 * Subsidized loans are skipped entirely — their interest does not accrue to the
 * borrower during deferment.
 *
 * Error isolation: per-loan errors are caught and logged without aborting others.
 *
 * @module jobs/loan-deferment-accrual
 */

import { prisma } from "../db.js"

// ── Helpers ────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Thrown to abort (and roll back) an accrual when the account is no longer
 * negative — i.e. a concurrent payment paid the loan off between our balance read
 * and the debit. Caught and treated as a benign SKIP, not a failure.
 */
class ConcurrentPayoffError extends Error {
  constructor(loanId: string) {
    super(`Account for loan ${loanId} no longer negative — accrual aborted`)
    this.name = "ConcurrentPayoffError"
  }
}

/** Whole calendar months from `start` to `now` (can be negative if future). */
function monthsElapsed(start: Date, now: Date): number {
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
}

/**
 * How many whole deferment months still need capitalizing as of `now`.
 *
 * Months are counted by calendar-month index from `start`, matching the rest of
 * the system (the monthly payment grid, the 1st-of-month cron schedule, and the
 * UI's `remainingLoanPhases`). Accruable months are indices [0, defermentMonths):
 *  - No prior accrual → only the current in-window month (already-elapsed
 *    deferment is reflected in the user-entered balance; catching it up would
 *    double-count).
 *  - Prior accrual → catch up from the month after the watermark through the
 *    final deferment month, so a missed run is recovered even when `now` is
 *    already past the window end.
 *
 * Exported for direct unit testing of the date/window math.
 */
export function defermentMonthsToAccrue(
  start: Date,
  defermentMonths: number,
  lastAccrual: Date | null,
  now: Date,
): number {
  if (now < start) return 0 // not originated yet
  const windowEndIdx = defermentMonths - 1
  if (windowEndIdx < 0) return 0
  const nowIdx = monthsElapsed(start, now)
  if (lastAccrual === null) {
    return nowIdx >= 0 && nowIdx <= windowEndIdx ? 1 : 0
  }
  // Clamp to >= 0 so a watermark that predates the start date (a future-start
  // loan, legacy data, clock skew) can't make `lastIdx` negative and inflate the
  // catch-up into pre-origination "phantom" months.
  const lastIdx = Math.max(0, monthsElapsed(start, lastAccrual))
  return Math.max(0, Math.min(nowIdx, windowEndIdx) - lastIdx)
}

// ── Main Job ───────────────────────────────────────────────────────────────

/**
 * Capitalizes one month of deferment interest for every eligible unsubsidized
 * loan currently inside its deferment window.
 */
export async function runLoanDefermentAccrual(): Promise<void> {
  const runDate = new Date()
  // First instant of the current calendar month — used as the atomic claim
  // boundary: a loan is eligible this month only if its watermark predates it.
  const monthStart = new Date(runDate.getFullYear(), runDate.getMonth(), 1)
  console.log(`[loan-deferment-accrual] Job started at ${runDate.toISOString()}`)

  // Unsubsidized loans with a deferment phase, still owing money and active.
  const loans = await prisma.loan.findMany({
    where: {
      subsidized: false,
      defermentMonths: { gt: 0 },
      account: {
        isActive: true,
        type: { in: ["LOAN", "MORTGAGE"] },
        balance: { lt: 0 },
      },
    },
    include: {
      account: { select: { id: true, name: true, balance: true, userId: true } },
    },
  })

  if (loans.length === 0) {
    console.log("[loan-deferment-accrual] No deferred unsubsidized loans found. Exiting.")
    return
  }

  console.log(`[loan-deferment-accrual] Evaluating ${loans.length} deferred loan(s)...`)

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const loan of loans) {
    const startDate = new Date(loan.startDate)
    const monthLabel = runDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })

    // Cheap snapshot pre-check: skip without opening a transaction when there's
    // nothing to accrue. The authoritative window + eligibility recompute happens
    // inside the transaction against freshly-read fields, so a since-edited loan
    // can't move money on stale data.
    const snapMonths = defermentMonthsToAccrue(
      startDate,
      loan.defermentMonths ?? 0,
      loan.lastDefermentAccrual ? new Date(loan.lastDefermentAccrual) : null,
      runDate,
    )
    if (snapMonths <= 0) {
      skipped++
      continue
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Re-read the loan + account UNDER the transaction so the accrual window
        // and eligibility reflect any edit committed since the findMany snapshot.
        const fresh = await tx.loan.findUnique({
          where: { id: loan.id },
          include: {
            account: { select: { isActive: true, type: true, balance: true, userId: true } },
          },
        })
        if (!fresh || !fresh.account) return null
        // Durable eligibility, re-validated against fresh data.
        if (fresh.subsidized || (fresh.defermentMonths ?? 0) <= 0) return null
        if (!fresh.account.isActive || !(fresh.account.type === "LOAN" || fresh.account.type === "MORTGAGE")) {
          return null
        }
        const balance = Number(fresh.account.balance)
        if (balance >= 0) return { interest: 0, months: 0 } // nothing owed

        // Recompute the accrual window from the fresh start / deferment / watermark.
        const months = defermentMonthsToAccrue(
          new Date(fresh.startDate),
          fresh.defermentMonths ?? 0,
          fresh.lastDefermentAccrual ? new Date(fresh.lastDefermentAccrual) : null,
          runDate,
        )
        if (months <= 0) return { interest: 0, months: 0 }

        // Atomically claim the current month (idempotency). The conditional WHERE
        // only matches when the watermark predates this month; under the row lock
        // two racing runs serialize and the loser matches zero rows. The
        // eligibility predicate is a redundant safety net beside the checks above.
        const claim = await tx.loan.updateMany({
          where: {
            id: loan.id,
            subsidized: false,
            defermentMonths: { gt: 0 },
            account: { isActive: true, type: { in: ["LOAN", "MORTGAGE"] }, balance: { lt: 0 } },
            OR: [
              { lastDefermentAccrual: null },
              { lastDefermentAccrual: { lt: monthStart } },
            ],
          },
          data: { lastDefermentAccrual: runDate },
        })
        if (claim.count !== 1) return null // already claimed this month, or no longer eligible

        const rate = Number(fresh.interestRate) // percentage, e.g. 6.5

        // Compound each caught-up month onto the running balance.
        let runningBalance = Math.abs(balance)
        let totalInterest = 0
        for (let k = 0; k < months; k++) {
          const monthInterest = round2(runningBalance * (rate / 100 / 12))
          if (monthInterest <= 0) break
          totalInterest = round2(totalInterest + monthInterest)
          runningBalance = round2(runningBalance + monthInterest)
        }
        if (totalInterest <= 0) return { interest: 0, months: 0 }

        // Grow the debt — but ONLY while the account is still negative. The loan
        // claim above proved the account was negative at claim time; guarding the
        // decrement on `balance < 0` makes Postgres re-check the LIVE balance under
        // the row lock, so a concurrent payoff that zeroed it since the read yields
        // zero matched rows instead of resurrecting a paid-off loan to -interest.
        const debit = await tx.account.updateMany({
          where: {
            id: loan.accountId,
            isActive: true,
            type: { in: ["LOAN", "MORTGAGE"] },
            balance: { lt: 0 },
          },
          data: { balance: { decrement: totalInterest } },
        })
        // count !== 1 ⇒ the account was paid off (or deactivated) mid-run. Throw to
        // roll the whole transaction back: the watermark claim and the charge below
        // revert together, so next month re-evaluates from a clean slate.
        if (debit.count !== 1) throw new ConcurrentPayoffError(loan.id)

        const description =
          months > 1
            ? `Deferment Interest — ${monthLabel} (${months}-month catch-up)`
            : `Deferment Interest — ${monthLabel}`

        // Record the charge in the ledger (no InterestLog — see module doc).
        await tx.transaction.create({
          data: {
            date: runDate,
            description,
            amount: -totalInterest,
            type: "INTEREST_CHARGED",
            category: "Interest",
            source: "SYSTEM",
            notes: `Interest accrued and capitalized during deferment at ${rate}% over ${months} month(s), from balance $${Math.abs(balance).toFixed(2)}`,
            userId: fresh.account.userId,
            accountId: loan.accountId,
          },
        })

        return { interest: totalInterest, months }
      })

      if (result === null) {
        console.log(
          `[loan-deferment-accrual] SKIP  loan=${loan.id} (${loan.account.name}) — already accrued this month or no longer eligible`,
        )
        skipped++
      } else if (result.interest <= 0) {
        console.log(
          `[loan-deferment-accrual] SKIP  loan=${loan.id} (${loan.account.name}) — nothing to accrue this run`,
        )
        skipped++
      } else {
        console.log(
          `[loan-deferment-accrual] OK    loan=${loan.id} (${loan.account.name}) — capitalized $${result.interest.toFixed(2)} over ${result.months} month(s)`,
        )
        processed++
      }
    } catch (err) {
      if (err instanceof ConcurrentPayoffError) {
        // Benign: the loan was paid off between our read and the debit. The whole
        // accrual rolled back, so nothing was charged and no money moved.
        console.log(
          `[loan-deferment-accrual] SKIP  loan=${loan.id} (${loan.account.name}) — account paid off mid-run; accrual rolled back`,
        )
        skipped++
      } else {
        console.error(`[loan-deferment-accrual] ERROR loan=${loan.id} (${loan.account.name}):`, err)
        failed++
      }
    }
  }

  console.log(
    `[loan-deferment-accrual] Job complete. processed=${processed} skipped=${skipped} failed=${failed}`,
  )
}
