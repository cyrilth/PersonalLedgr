/**
 * Standalone CLI runner for the wipe script.
 *
 * Run via: pnpm db:wipe (which calls tsx src/db/run-wipe.ts)
 * See run-seed.ts for why this needs its own PrismaClient.
 */

import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { wipe } from "./wipe-seed.js"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

wipe(prisma)
  .catch((e) => {
    console.error("[wipe] Error:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
