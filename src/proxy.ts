import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

function hasSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name
    return (
      name === "authjs.session-token" ||
      name === "__Secure-authjs.session-token" ||
      name.startsWith("authjs.session-token.") ||
      name.startsWith("__Secure-authjs.session-token.")
    )
  })
}

/**
 * Optimistic gate only. The dashboard page still checks the database session.
 * Proxy must not query Postgres.
 */
export function proxy(request: NextRequest) {
  if (hasSessionCookie(request)) return NextResponse.next()
  const signInUrl = new URL("/signup", request.url)
  signInUrl.searchParams.set("callbackUrl", "/dashboard")
  return NextResponse.redirect(signInUrl)
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
}
