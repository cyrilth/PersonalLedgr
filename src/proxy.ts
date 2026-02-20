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

  // Authenticated user trying to access auth pages
  if (session && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
