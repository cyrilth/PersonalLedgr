/**
 * Wipes all finance data from the database.
 *
 * Deletes in dependency order (children before parents) to satisfy FK constraints.
 * Auth models (users, sessions) are preserved by default — uncomment the auth
 * section to also wipe users. This is a pure library module; the CLI runner
 * is in run-wipe.ts.
 */

import type { PrismaClient } from "@prisma/client"

export async function wipe(prisma?: PrismaClient) {
  if (!prisma) {
    const { prisma: dbPrisma } = await import("@/db")
    prisma = dbPrisma
  }

  console.log("[wipe] Clearing all data...")

  // Delete in dependency order (children before parents)
  await prisma.billPayment.deleteMany()
  await prisma.interestLog.deleteMany()
  await prisma.budget.deleteMany()
  await prisma.userCategory.deleteMany()
  await prisma.userSettings.deleteMany()
  await prisma.recurringBill.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.aprRate.deleteMany()
  await prisma.creditCardDetails.deleteMany()
  await prisma.loan.deleteMany()
  await prisma.account.deleteMany()

  // Auth models (optional — uncomment to also wipe users)
  // await prisma.session.deleteMany()
  // await prisma.authAccount.deleteMany()
  // await prisma.verification.deleteMany()
  // await prisma.user.deleteMany()

  console.log("[wipe] All finance data cleared.")
}

