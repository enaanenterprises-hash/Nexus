import "server-only"
import { auth } from "@/auth"
import { CONNECTOR_CATALOG } from "@/lib/connectors/catalog"
import { vaultReady } from "@/lib/connectors/vault"
import { databaseUrl } from "@/lib/db/client"
import { json, jsonError } from "@/lib/research/route-helpers"
import { BUILT_IN_RECIPES } from "./automation/recipes"
import { COMMAND_DRIVERS } from "./drivers"
import { missingOAuthEnv } from "./drivers/oauth"
import type { CommandResult } from "./service"
import * as store from "./store"

export { json, jsonError }

/** Signed-in user with a database, or a ready-to-return error response. */
export async function requireCommandUser(): Promise<{ userId: string } | { response: Response }> {
  if (!process.env["AUTH_SECRET"]?.trim() && !process.env["NEXTAUTH_SECRET"]?.trim()) {
    return { response: jsonError(401, "Sign in to use Command.", "unauthorized") }
  }
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { response: jsonError(401, "Sign in to use Command.", "unauthorized") }
  if (!databaseUrl()) return { response: jsonError(503, "Command needs DATABASE_URL.", "no_database") }
  return { userId }
}

export function timeZoneFrom(value: unknown): string {
  const tz = typeof value === "string" ? value : ""
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return tz || "UTC"
  } catch {
    return "UTC"
  }
}

/** What the server can do for each connector right now (driver present, env configured). */
export function connectorAvailability() {
  return Object.fromEntries(
    CONNECTOR_CATALOG.map((m) => {
      if (m.live.status !== "available" || !COMMAND_DRIVERS[m.id]) return [m.id, { connectable: false, missing: [] as string[] }]
      const provider = m.auth.type === "oauth" ? m.auth.provider : null
      const missing = provider === "google" || provider === "strava" || provider === "spotify" ? missingOAuthEnv(provider) : []
      if (m.auth.type !== "none" && !vaultReady()) missing.push("NEXUS_CREDENTIALS_KEY")
      return [m.id, { connectable: missing.length === 0, missing }]
    }),
  )
}

export async function commandState(userId: string) {
  const [connections, items, runs, enabled, focus] = await Promise.all([
    store.listConnections(userId),
    store.listRecentItems(userId),
    store.listRuns(userId),
    store.recipeStates(userId),
    store.activeFocus(userId),
  ])
  return {
    connections: connections.map(store.publicConnection),
    items,
    runs,
    recipes: BUILT_IN_RECIPES.map((r) => ({ ...r, enabled: enabled[r.id] ?? r.defaultEnabled })),
    focus,
    availability: connectorAvailability(),
  }
}

export type CommandState = Awaited<ReturnType<typeof commandState>>

export async function stateWith(userId: string, result?: Partial<CommandResult>) {
  return { ...(await commandState(userId)), created: result?.created ?? [], newRuns: result?.runs ?? [], errors: result?.errors ?? [] }
}

export function commandFailure(error: unknown) {
  console.error("[command] request failed", error instanceof Error ? error.message : error)
  return jsonError(500, "Command could not reach its storage.", "db_error")
}
