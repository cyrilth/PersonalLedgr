/**
 * Wipes all finance data from the database.
 *
 * Deletes in dependency order (children before parents) to satisfy FK constraints.
 * Auth models (users, sessions) are preserved by default — uncomment the auth
 * section to also wipe users. This is a pure library module; the CLI runner
 * is in run-wipe.ts.
 */

import type { PrismaClient } from "@prisma/client"

export async function wipe(userId: string, prisma?: PrismaClient) {
  if (!prisma) {
    const { prisma: dbPrisma } = await import("@/db")
    prisma = dbPrisma
  }

  console.log(`[wipe] Clearing data for user ${userId}...`)

  // Delete in dependency order (children before parents)
  // Models without direct userId use nested relation filters
  await prisma.billPayment.deleteMany({ where: { recurringBill: { userId } } })
  await prisma.interestLog.deleteMany({ where: { userId } })
  await prisma.budget.deleteMany({ where: { userId } })
  await prisma.userCategory.deleteMany({ where: { userId } })
  await prisma.userSettings.deleteMany({ where: { userId } })
  await prisma.recurringBill.deleteMany({ where: { userId } })
  await prisma.transaction.deleteMany({ where: { userId } })
  await prisma.aprRate.deleteMany({ where: { account: { userId } } })
  await prisma.creditCardDetails.deleteMany({ where: { account: { userId } } })
  await prisma.loan.deleteMany({ where: { account: { userId } } })
  await prisma.account.deleteMany({ where: { userId } })

  console.log("[wipe] User finance data cleared.")
}

