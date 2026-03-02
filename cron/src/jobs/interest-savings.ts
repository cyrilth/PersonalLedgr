/**
 * Monthly savings interest payout job.
 *
 * Runs on the 1st of every month. For each active SAVINGS or CHECKING account
 * that has a positive balance and an APY set, this job:
 *
 *   1. Calculates the monthly interest:  balance × (apy / 100 / 12)
 *   2. Rounds the result to 2 decimal places.
 *   3. Creates an InterestLog record (type: EARNED).
 *   4. Creates an INTEREST_EARNED Transaction (source: SYSTEM).
 *   5. Increments the account balance by the interest amount.
 *
 * All three writes for a given account are wrapped in a single Prisma
 * interactive transaction so they succeed or fail atomically.
 *
 * Accounts are skipped when:
 *   - No APY is set on the account.
 *   - The account balance is zero or negative (no interest accrues).
 *   - The computed interest rounds to zero.
 *
 * @module jobs/interest-savings
 */

import Decimal from "decimal.js"
import { prisma } from "../db.js"

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal shape of a SAVINGS/CHECKING account row with APY. */
interface InterestAccount {
  id: string
  name: string
  balance: Decimal
  apy: Decimal
  userId: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Computes the monthly interest amount for the given balance and annual rate.
 *
 * Formula:  interest = balance × (apy / 100 / 12)
 *
 * The result is rounded to 2 decimal places using "round half away from zero"
 * semantics (standard banker rounding for currency).
 */
function calcMonthlyInterest(balance: Decimal, apy: Decimal): number {
  const balanceNum = balance.toNumber()
  const rateNum = apy.toNumber()
  const monthly = balanceNum * (rateNum / 100 / 12)
  return Math.round(monthly * 100) / 100
}

// ── Main Job ───────────────────────────────────────────────────────────────

/**
 * Processes monthly savings interest for all eligible SAVINGS and CHECKING accounts.
 */
export async function runSavingsInterest(): Promise<void> {
  const runDate = new Date()
  console.log(`[interest-savings] Job started at ${runDate.toISOString()}`)

  // ── 1. Fetch eligible accounts ──────────────────────────────────

  const accounts: InterestAccount[] = await prisma.account.findMany({
    where: {
      type: { in: ["SAVINGS", "CHECKING", "CD"] },
      isActive: true,
      balance: { gt: 0 },
      apy: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      balance: true,
      apy: true,
      userId: true,
    },
  })

  if (accounts.length === 0) {
    console.log("[interest-savings] No eligible accounts found. Exiting.")
    return
  }

  console.log(
    `[interest-savings] Processing ${accounts.length} account(s)...`,
  )

  // ── 2. Process each account ──────────────────────────────────────────────

  let processed = 0
  let skipped = 0
  let failed = 0

  for (const account of accounts) {
    const interestAmount = calcMonthlyInterest(account.balance, account.apy)

    if (interestAmount <= 0) {
      console.log(
        `[interest-savings] SKIP  account=${account.id} (${account.name}) — computed interest is $${interestAmount}`,
      )
      skipped++
      continue
    }

    const interestStr = interestAmount.toFixed(2)
    const apyPct = account.apy.toNumber()

    try {
      await prisma.$transaction(async (tx) => {
        // a) Record the interest log entry
        await tx.interestLog.create({
          data: {
            date: runDate,
            amount: interestStr,
            type: "EARNED",
            notes: `Monthly interest at ${apyPct}% APY on balance $${account.balance.toFixed(2)}`,
            userId: account.userId,
            accountId: account.id,
          },
        })

        // b) Create the INTEREST_EARNED transaction
        await tx.transaction.create({
          data: {
            date: runDate,
            description: "Monthly savings interest",
            amount: interestStr,
            type: "INTEREST_EARNED",
            source: "SYSTEM",
            userId: account.userId,
            accountId: account.id,
          },
        })

        // c) Update the account balance
        await tx.account.update({
          where: { id: account.id },
          data: {
            balance: {
              increment: interestStr,
            },
          },
        })
      })

      console.log(
        `[interest-savings] OK    account=${account.id} (${account.name}) — +$${interestStr} interest`,
      )
      processed++
    } catch (err) {
      console.error(
        `[interest-savings] ERROR account=${account.id} (${account.name}):`,
        err,
      )
      failed++
    }
  }

  // ── 3. Summary ────────────────────────────────────────────────────────────

  console.log(
    `[interest-savings] Job complete. processed=${processed} skipped=${skipped} failed=${failed}`,
  )
}
