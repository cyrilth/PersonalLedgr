/**
 * Prisma Client for the cron container.
 *
 * Unlike the Next.js app's singleton (which caches on globalThis for HMR),
 * this creates a single instance — the cron container doesn't hot-reload.
 * Uses the same DATABASE_URL and Prisma schema as the app container.
 */

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
})

export const prisma = new PrismaClient({ adapter })
