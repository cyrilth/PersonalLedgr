/**
 * Monthly savings interest payout job.
 *
 * Runs on the 1st of every month. For each active SAVINGS account that has a
 * positive balance and at least one active APR rate, this job:
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
 *   - No active AprRate exists for the account.
 *   - The account balance is zero or negative (no interest accrues).
 *   - The computed interest rounds to zero.
 *
 * @module jobs/interest-savings
 */

import Decimal from "decimal.js"
import { prisma } from "../db.js"

// ── Types ──────────────────────────────────────────────────────────────────

/** Minimal shape of a SAVINGS account row with its active APR rates. */
interface SavingsAccount {
  id: string
  name: string
  balance: Decimal
  userId: string
  aprRates: Array<{
    id: string
    apr: Decimal
  }>
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns the first active APR rate for a savings account, or `null` if none
 * exists. For a SAVINGS account the APR column stores the annual yield (APY).
 *
 * @param account - The savings account with its eagerly loaded active rates.
 * @returns The first active AprRate record, or `null`.
 */
function getActiveSavingsRate(
  account: SavingsAccount,
): SavingsAccount["aprRates"][number] | null {
  return account.aprRates.length > 0 ? account.aprRates[0] : null
}

/**
 * Computes the monthly interest amount for the given balance and annual rate.
 *
 * Formula:  interest = balance × (apy / 100 / 12)
 *
 * The result is rounded to 2 decimal places using "round half away from zero"
 * semantics (standard banker rounding for currency).
 *
 * @param balance - Current account balance as a Prisma Decimal.
 * @param annualRate - Annual percentage yield stored as a Prisma Decimal.
 * @returns Monthly interest amount rounded to 2 decimal places, as a number.
 */
function calcMonthlyInterest(balance: Decimal, annualRate: Decimal): number {
  const balanceNum = balance.toNumber()
  const rateNum = annualRate.toNumber()
  const monthly = balanceNum * (rateNum / 100 / 12)
  return Math.round(monthly * 100) / 100
}

// ── Main Job ───────────────────────────────────────────────────────────────

/**
 * Processes monthly savings interest for all eligible SAVINGS accounts.
 *
 * Fetches every active SAVINGS account that has a positive balance and at
 * least one active AprRate, then atomically records the interest earned and
 * updates the account balance for each.
 *
 * Logs progress and a final summary to stdout so results are visible in
 * container logs. Non-fatal per-account errors are caught and logged without
 * aborting processing for the remaining accounts.
 *
 * @returns A promise that resolves when all accounts have been processed.
 * @throws Will throw (and let the caller log) only if the initial database
 *         query fails entirely.
 */
export async function runSavingsInterest(): Promise<void> {
  const runDate = new Date()
  console.log(`[interest-savings] Job started at ${runDate.toISOString()}`)

  // ── 1. Fetch eligible SAVINGS accounts ──────────────────────────────────

  const accounts: SavingsAccount[] = await prisma.account.findMany({
    where: {
      type: "SAVINGS",
      isActive: true,
      balance: { gt: 0 },
      aprRates: {
        some: { isActive: true },
      },
    },
    select: {
      id: true,
      name: true,
      balance: true,
      userId: true,
      aprRates: {
        where: { isActive: true },
        select: { id: true, apr: true },
        take: 1,
      },
    },
  })

  if (accounts.length === 0) {
    console.log("[interest-savings] No eligible SAVINGS accounts found. Exiting.")
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
    const rate = getActiveSavingsRate(account)

    if (!rate) {
      console.log(
        `[interest-savings] SKIP  account=${account.id} (${account.name}) — no active rate`,
      )
      skipped++
      continue
    }

    const interestAmount = calcMonthlyInterest(account.balance, rate.apr)

    if (interestAmount <= 0) {
      console.log(
        `[interest-savings] SKIP  account=${account.id} (${account.name}) — computed interest is $${interestAmount}`,
      )
      skipped++
      continue
    }

    const interestStr = interestAmount.toFixed(2)
    const aprPct = rate.apr.toNumber()

    try {
      await prisma.$transaction(async (tx) => {
        // a) Record the interest log entry
        await tx.interestLog.create({
          data: {
            date: runDate,
            amount: interestStr,
            type: "EARNED",
            notes: `Monthly savings interest at ${aprPct}% APY on balance $${account.balance.toFixed(2)}`,
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
