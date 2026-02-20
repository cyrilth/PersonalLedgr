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

seed(prisma)
  .catch((e) => {
    console.error("[seed] Error:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
