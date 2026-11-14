import "server-only"
import { cookies } from "next/headers"
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog"
import { credentialsFromTokens } from "./drivers/oauth"
import { listConnections, readCredentials, saveConnection } from "./store"

export const GOOGLE_PENDING_COOKIE = "nexus_command_google"

export const GOOGLE_CONNECTORS = CONNECTOR_CATALOG.filter((m) => m.auth.type === "oauth" && m.auth.provider === "google")

interface GoogleAccount {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  scope?: string
}

/**
 * Called from the Auth.js `signIn` event. Stores the Google grant for the
 * service the user just asked to connect, and refreshes tokens for Google
 * services they already connected. Never connects a service on its own.
 */
export async function storeGoogleGrant(userId: string, account: GoogleAccount) {
  if (!account.access_token) return
  const jar = await cookies()
  const pending = new Set((jar.get(GOOGLE_PENDING_COOKIE)?.value ?? "").split(",").filter(Boolean))
  if (pending.size) jar.delete(GOOGLE_PENDING_COOKIE)
  const granted = new Set((account.scope ?? "").split(/\s+/))
  const connections = new Map((await listConnections(userId)).map((c) => [c.connectorId, c]))
  const tokens = { access_token: account.access_token, refresh_token: account.refresh_token, expires_at: account.expires_at, scope: account.scope }
  for (const m of GOOGLE_CONNECTORS) {
    const existing = connections.get(m.id)
    if (m.auth.type !== "oauth" || !(existing || pending.has(m.id))) continue
    if (!m.auth.scopes.every((s) => granted.has(s))) continue
    let previous: Record<string, string> | null = null
    try {
      previous = existing ? readCredentials(existing) : null
    } catch {
      previous = null
    }
    // Google only returns a refresh token on consent; credentialsFromTokens keeps the stored one otherwise.
    await saveConnection(userId, m.id, { credentials: credentialsFromTokens(tokens, previous) })
  }
}
