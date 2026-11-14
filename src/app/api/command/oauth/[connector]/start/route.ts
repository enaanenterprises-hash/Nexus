import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { connectorAvailability, requireCommandUser } from "@/lib/command/api"
import { authorizeUrl } from "@/lib/command/drivers/oauth"
import { OAUTH_STATE_COOKIE, dashboardUrl, oauthAppFor, redirectUri } from "@/lib/command/oauth-routes"

export async function GET(request: Request, { params }: { params: Promise<{ connector: string }> }) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const { connector } = await params
  const app = oauthAppFor(connector)
  if (!app || !connectorAvailability()[connector]?.connectable) {
    return NextResponse.redirect(dashboardUrl(request, { command: "error", service: connector, reason: "config" }))
  }
  const state = randomBytes(18).toString("base64url")
  const response = NextResponse.redirect(authorizeUrl(app.app, { redirectUri: redirectUri(request, connector), state, scopes: app.scopes }))
  response.cookies.set(OAUTH_STATE_COOKIE, `${connector}.${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/command/oauth",
  })
  return response
}
