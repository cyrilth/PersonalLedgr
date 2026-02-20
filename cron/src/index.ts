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

import { prisma } from "./db.js"

async function main() {
  await prisma.$connect()
  console.log("[cron] Connected to database")

  // Jobs will be registered here as they are built (Phase 4-5):
  // - interest-cc.ts      (daily CC interest accrual)
  // - interest-savings.ts (monthly savings interest)
  // - statement-close.ts  (daily CC statement cycle processing)
  // - apr-expiration.ts   (daily expired APR rate cleanup)
  // - recurring-bills.ts  (daily recurring bill generation)
  // - plaid-sync.ts       (Plaid sync every 6 hours — Phase 6)

  console.log("[cron] All jobs registered. Waiting for schedules...")

  // Keep the Node.js process alive for cron schedule execution
  setInterval(() => {}, 1 << 30)
}

main().catch((err) => {
  console.error("[cron] Fatal error:", err)
  process.exit(1)
})
