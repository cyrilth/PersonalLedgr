/**
 * Next.js 16 proxy — replaces the deprecated middleware.ts.
 *
 * Uses Better Auth's cookie-only session check (no DB hit) for fast
 * route protection. This runs on every non-static request:
 * - Unauthenticated users are redirected to /login
 * - Authenticated users are redirected away from /login and /register
 * - Public paths (/login, /register, /api/auth) are always accessible
 */

import { NextRequest, NextResponse } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

const publicPaths = ["/login", "/register", "/api/auth"]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = publicPaths.some((path) => pathname.startsWith(path))
  const session = getSessionCookie(request)

  // Unauthenticated user trying to access protected route
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Authenticated user trying to access auth pages — send them to dashboard
  if (session && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

// Match all routes except static assets (images, fonts, Next.js internals)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
