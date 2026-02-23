/**
 * Cron container entry point.
 *
 * This runs in a separate Docker container from the Next.js app, connecting
 * directly to the same PostgreSQL database. It registers all scheduled jobs
 * (interest accrual, statement processing, bill generation, etc.) using node-cron.
 *
 * The setInterval keep-alive prevents Node.js from exiting when no cron jobs
 * are registered yet — without it, the process would exit immediately since
 * there's nothing keeping the event loop alive.
 */

import cron from "node-cron"
import { prisma } from "./db.js"
import { runCCInterestAccrual } from "./jobs/interest-cc.js"
import { runStatementClose } from "./jobs/statement-close.js"
import { runAprExpiration } from "./jobs/apr-expiration.js"
import { runSavingsInterest } from "./jobs/interest-savings.js"
import { runRecurringBills } from "./jobs/recurring-bills.js"

/**
 * Bootstraps the cron container: connects to the database, registers all
 * scheduled jobs with node-cron, and keeps the process alive.
 *
 * When the `CRON_RUN_NOW` environment variable is set to `"true"`, all jobs
 * are executed immediately in sequence (useful for testing), then the process
 * exits cleanly instead of waiting for scheduled triggers.
 *
 * Schedule summary:
 *   - `0 0 * * *`  — interest-cc (daily CC interest accrual)
 *   - `0 0 * * *`  — statement-close (daily CC statement cycle processing)
 *   - `0 0 * * *`  — apr-expiration (daily expired APR rate cleanup)
 *   - `0 0 1 * *`  — interest-savings (monthly savings APY payout)
 *   - `0 6 * * *`  — recurring-bills (daily bill auto-generation)
 *
 * @throws Exits with code 1 if database connection or job registration fails.
 */
async function main() {
  await prisma.$connect()
  console.log("[cron] Connected to database")

  // Daily at midnight — credit card interest accrual
  cron.schedule("0 0 * * *", async () => {
    try {
      await runCCInterestAccrual()
    } catch (err) {
      console.error("[cron] Unhandled error in runCCInterestAccrual:", err)
    }
  })
  console.log("[cron] Registered: interest-cc (daily midnight)")

  // Daily at midnight — credit card statement cycle processing
  cron.schedule("0 0 * * *", async () => {
    try {
      await runStatementClose()
    } catch (err) {
      console.error("[cron] Unhandled error in runStatementClose:", err)
    }
  })
  console.log("[cron] Registered: statement-close (daily midnight)")

  // Daily at midnight — expired APR rate cleanup
  cron.schedule("0 0 * * *", async () => {
    try {
      await runAprExpiration()
    } catch (err) {
      console.error("[cron] Unhandled error in runAprExpiration:", err)
    }
  })
  console.log("[cron] Registered: apr-expiration (daily midnight)")

  // Monthly on the 1st at midnight — savings APY payout
  cron.schedule("0 0 1 * *", async () => {
    try {
      await runSavingsInterest()
    } catch (err) {
      console.error("[cron] Unhandled error in runSavingsInterest:", err)
    }
  })
  console.log("[cron] Registered: interest-savings (monthly 1st midnight)")

  // Daily at 6 AM — recurring bill auto-generation
  cron.schedule("0 6 * * *", async () => {
    try {
      await runRecurringBills()
    } catch (err) {
      console.error("[cron] Unhandled error in runRecurringBills:", err)
    }
  })
  console.log("[cron] Registered: recurring-bills (daily 6 AM)")

  // Jobs still to be registered (Phase 6):
  // - plaid-sync.ts       (Plaid sync every 6 hours — Phase 6)

  console.log("[cron] All jobs registered. Waiting for schedules...")

  // Run all jobs immediately if CRON_RUN_NOW is set (for testing)
  if (process.env.CRON_RUN_NOW === "true") {
    console.log("[cron] CRON_RUN_NOW=true, running all jobs immediately...")
    await runCCInterestAccrual()
    await runStatementClose()
    await runAprExpiration()
    await runSavingsInterest()
    await runRecurringBills()
    console.log("[cron] All jobs completed.")
    await prisma.$disconnect()
    process.exit(0)
  }

  // Keep the Node.js process alive for cron schedule execution
  setInterval(() => {}, 1 << 30)
}

main().catch((err) => {
  console.error("[cron] Fatal error:", err)
  process.exit(1)
})
