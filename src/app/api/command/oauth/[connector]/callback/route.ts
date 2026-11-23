import { NextResponse, type NextRequest } from "next/server"
import { requireCommandUser } from "@/lib/command/api"
import { exchangeCodeAndEnrich } from "@/lib/command/drivers/oauth"
import { DriverError } from "@/lib/command/drivers/types"
import { describeError } from "@/lib/command/service"
import { saveConnection } from "@/lib/command/store"
import {
  OAUTH_STATE_COOKIE,
  dashboardUrl,
  decodeOAuthStateCookie,
  oauthAppFor,
  redirectUri,
} from "@/lib/command/oauth-routes"

export async function GET(request: NextRequest, { params }: { params: Promise<{ connector: string }> }) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const { connector } = await params
  const url = new URL(request.url)
  const fail = (reason: string) => {
    const response = NextResponse.redirect(dashboardUrl(request, { command: "error", service: connector, reason }))
    response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/command/oauth" })
    return response
  }
  const app = oauthAppFor(connector)
  const statePayload = decodeOAuthStateCookie(request.cookies.get(OAUTH_STATE_COOKIE)?.value)
  const code = url.searchParams.get("code")
  if (!app) return fail("unknown")
  if (url.searchParams.get("error")) return fail("denied")
  if (!code || !statePayload || statePayload.connector !== connector || statePayload.state !== url.searchParams.get("state")) {
    return fail("state")
  }
  try {
    const { credentials, settings } = await exchangeCodeAndEnrich(
      app.app,
      code,
      redirectUri(request, connector),
      statePayload.verifier,
    )
    await saveConnection(user.userId, connector, { credentials, settings })
  } catch (error) {
    console.error("[command] oauth callback failed", describeError(error).message)
    if (error instanceof DriverError && error.message.toLowerCase().includes("instagram creator or business")) {
      return fail("no_ig_business")
    }
    return fail("exchange")
  }
  const successParams: Record<string, string> = { command: "connected", service: connector }
  if (statePayload.widget) successParams["widget"] = statePayload.widget
  if (statePayload.itemId) successParams["itemId"] = statePayload.itemId
  const response = NextResponse.redirect(dashboardUrl(request, successParams))
  response.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/command/oauth" })
  return response
}
