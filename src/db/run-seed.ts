/**
 * Standalone CLI runner for the seed script.
 *
 * Run via: pnpm db:seed (which calls tsx src/db/run-seed.ts)
 *
 * Creates its own PrismaClient instead of importing from @/db because this
 * runs outside of Next.js (no Turbopack, no path aliases at runtime).
 * The seed logic itself lives in seed.ts as a pure function.
 */

import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { seed } from "./seed.js"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function run() {
  // Create or find the demo user
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@personalledgr.local" },
    update: {},
    create: {
      id: crypto.randomUUID(),
      name: "Demo User",
      email: "demo@personalledgr.local",
      emailVerified: true,
    },
  })

  // Create auth account with password so the demo user can log in
  await prisma.authAccount.upsert({
    where: { id: `${demoUser.id}-credential` },
    update: {},
    create: {
      id: `${demoUser.id}-credential`,
      accountId: demoUser.id,
      providerId: "credential",
      userId: demoUser.id,
      password:
        "87503ef442cb390da0c27d671804afe5:f1ad5489f6a4abce94328002053ed803eee5c2f144b8e8711202adb9ba194c6d5e676c0e199ae3b7a236e598ee12fc282f3eff6f631caa8283fc06a3798003e2",
    },
  })

  console.log("[seed] Demo user:", demoUser.email)
  await seed(demoUser.id, prisma)
}

run()
  .catch((e) => {
    console.error("[seed] Error:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
