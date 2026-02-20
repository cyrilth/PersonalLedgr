/**
 * Better Auth catch-all API route.
 *
 * Handles all /api/auth/* endpoints: sign-in, sign-up, sign-out,
 * session management, password change, and user updates.
 * Better Auth's toNextJsHandler converts the auth instance into
 * Next.js-compatible GET and POST route handlers.
 */

import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { GET, POST } = toNextJsHandler(auth)
