/**
 * Better Auth server-side configuration.
 *
 * - Uses Prisma adapter pointed at our PostgreSQL database
 * - Email/password auth enabled (no OAuth providers)
 * - nextCookies plugin enables cookie-based sessions for Next.js
 * - Account model renamed to "authAccount" to avoid conflict with the
 *   finance Account model in our schema
 *
 * Server actions call `auth.api.getSession({ headers })` to get the
 * current user. The proxy (src/proxy.ts) uses cookie-only checks for
 * fast route protection without hitting the database.
 */

import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { prisma } from "@/db"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
  plugins: [nextCookies()],
  account: {
    modelName: "authAccount",
  },
})
