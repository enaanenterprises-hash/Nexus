import "server-only"
import { getConnector } from "@/lib/connectors/catalog"
import { isOAuthApp, type OAuthAppId } from "./drivers/oauth"

export const OAUTH_STATE_COOKIE = "nexus_command_oauth"

/** The OAuth app behind a connector, for connectors that authorize outside Auth.js. */
export function oauthAppFor(connectorId: string): { app: OAuthAppId; scopes: string[] } | null {
  const m = getConnector(connectorId)
  if (!m || m.auth.type !== "oauth" || m.auth.provider === "google" || !isOAuthApp(m.auth.provider)) return null
  return { app: m.auth.provider, scopes: m.auth.scopes }
}

export function redirectUri(request: Request, connectorId: string): string {
  const origin = process.env["AUTH_URL"]?.trim().replace(/\/+$/, "") || new URL(request.url).origin
  return `${origin}/api/command/oauth/${connectorId}/callback`
}

export function dashboardUrl(request: Request, params: Record<string, string>): URL {
  const url = new URL("/dashboard", process.env["AUTH_URL"]?.trim() || request.url)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return url
}
