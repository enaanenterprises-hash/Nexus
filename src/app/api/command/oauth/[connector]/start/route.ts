import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"
import { connectorAvailability, requireCommandUser } from "@/lib/command/api"
import { OAUTH_APPS, authorizeUrl, createPkcePair } from "@/lib/command/drivers/oauth"
import {
  OAUTH_STATE_COOKIE,
  dashboardUrl,
  encodeOAuthStateCookie,
  oauthAppFor,
  redirectUri,
} from "@/lib/command/oauth-routes"

export async function GET(request: Request, { params }: { params: Promise<{ connector: string }> }) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const { connector } = await params
  const app = oauthAppFor(connector)
  if (!app || !connectorAvailability()[connector]?.connectable) {
    return NextResponse.redirect(dashboardUrl(request, { command: "error", service: connector, reason: "config" }))
  }

  const reqUrl = new URL(request.url)
  const rawWidget = reqUrl.searchParams.get("widget")
  const widget = rawWidget === "storage" ? "storage" : undefined
  const rawItemId = reqUrl.searchParams.get("itemId")
  const itemId = rawItemId && /^[a-zA-Z0-9_-]{1,80}$/.test(rawItemId) ? rawItemId : undefined

  const state = randomBytes(18).toString("base64url")
  const needsPkce = Boolean((OAUTH_APPS[app.app] as { pkce?: boolean }).pkce)
  const pkce = needsPkce ? createPkcePair() : null

  const response = NextResponse.redirect(
    authorizeUrl(app.app, {
      redirectUri: redirectUri(request, connector),
      state,
      scopes: app.scopes,
      codeChallenge: pkce?.challenge,
    }),
  )
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    encodeOAuthStateCookie({
      connector,
      state,
      verifier: pkce?.verifier,
      widget,
      itemId,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/api/command/oauth",
    },
  )
  return response
}
