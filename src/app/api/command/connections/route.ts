import { commandFailure, connectorAvailability, json, jsonError, requireCommandUser, stateWith, timeZoneFrom } from "@/lib/command/api"
import { COMMAND_DRIVERS } from "@/lib/command/drivers"
import { describeError, syncCommand, verifyConnection } from "@/lib/command/service"
import { getConnection, readCredentials, saveConnection } from "@/lib/command/store"
import { getConnector } from "@/lib/connectors/catalog"
import { readJson } from "@/lib/research/route-helpers"

export const maxDuration = 60

function pick(source: unknown, keys: string[], max: number): Record<string, string> {
  const out: Record<string, string> = {}
  if (!source || typeof source !== "object") return out
  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key]
    if (typeof value === "string") out[key] = value.trim().slice(0, max)
  }
  return out
}

/** Connect a keyless or API-key service, or update settings of any connected service. OAuth services connect through their own flow. */
export async function POST(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const connectorId = String(body?.["connectorId"] ?? "")
  const manifest = getConnector(connectorId)
  if (!manifest) return jsonError(404, "Unknown service.", "not_found")
  const availability = connectorAvailability()[connectorId]
  if (!availability?.connectable) {
    const why = availability?.missing.length ? `The server needs ${availability.missing.join(", ")}.` : `${manifest.name} can't be connected yet.`
    return jsonError(400, why, "unavailable")
  }
  const timeZone = timeZoneFrom(body?.["timeZone"])

  try {
    const existing = await getConnection(user.userId, connectorId)
    const settings = pick(body?.["settings"], (manifest.settings ?? []).map((s) => s.key), 1000)
    let credentials: Record<string, string> | null | undefined
    if (manifest.auth.type === "api_key") {
      const sent = pick(body?.["credentials"], manifest.auth.fields.map((f) => f.key), 500)
      const hasSent = Object.values(sent).some(Boolean)
      if (hasSent || !existing?.hasCredentials) {
        const missing = manifest.auth.fields.filter((f) => !f.optional && !sent[f.key])
        if (missing.length) return jsonError(400, `Fill in ${missing.map((f) => f.label).join(", ")}.`, "invalid")
        credentials = sent
      }
    } else if (manifest.auth.type === "oauth" && !existing) {
      return jsonError(400, `Connect ${manifest.name} with its sign-in button.`, "invalid")
    }

    const mergedSettings = { ...(existing?.settings ?? {}), ...settings }
    try {
      await verifyConnection({
        userId: user.userId,
        connectorId,
        credentials: credentials ?? (existing ? readCredentials(existing) : null),
        settings: mergedSettings,
        timeZone,
        drivers: COMMAND_DRIVERS,
      })
    } catch (error) {
      return jsonError(400, describeError(error).message, "verify_failed")
    }

    await saveConnection(user.userId, connectorId, { settings: mergedSettings, credentials })
    const result = await syncCommand({ userId: user.userId, timeZone, drivers: COMMAND_DRIVERS, only: connectorId })
    return json(await stateWith(user.userId, result))
  } catch (error) {
    return commandFailure(error)
  }
}
