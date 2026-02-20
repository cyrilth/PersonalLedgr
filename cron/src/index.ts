import { prisma } from "./db.js"

async function main() {
  // Verify database connection
  await prisma.$connect()
  console.log("[cron] Connected to database")

  // Jobs will be registered here as they are built:
  // - interest-cc.ts      (daily CC interest accrual)
  // - interest-savings.ts (monthly savings interest)
  // - statement-close.ts  (daily CC statement cycle processing)
  // - apr-expiration.ts   (daily expired APR rate cleanup)
  // - recurring-bills.ts  (daily recurring bill generation)
  // - plaid-sync.ts       (Plaid sync every 6 hours — Phase 6)

  console.log("[cron] All jobs registered. Waiting for schedules...")

  // Keep the process alive so node-cron schedules can fire
  setInterval(() => {}, 1 << 30)
}

main().catch((err) => {
  console.error("[cron] Fatal error:", err)
  process.exit(1)
})
