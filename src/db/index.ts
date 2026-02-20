/**
 * Prisma Client singleton for the Next.js app.
 *
 * Prisma 7 requires a driver adapter — we use @prisma/adapter-pg for PostgreSQL.
 * In development, the client is cached on globalThis to survive hot-module reloads
 * (each HMR cycle re-executes module-level code, so without caching we'd leak
 * database connections).
 */

import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  })
  return new PrismaClient({ adapter })
}

// Reuse existing client in dev, create fresh in production
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Cache on globalThis so the next HMR cycle reuses the same connection
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
