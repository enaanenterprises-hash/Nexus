import { json, jsonError, requireCommandUser, stateWith } from "@/lib/command/api"
import { saveOverview } from "@/lib/command/store"
import { normalizeOverview } from "@/lib/command/widgets"
import { readJson } from "@/lib/research/route-helpers"

/** Saves the widgets on the one overview page. */
export async function PUT(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  try {
    await saveOverview(user.userId, normalizeOverview(body?.["widgets"]))
    return json(await stateWith(user.userId))
  } catch (error) {
    console.error("[command] overview failed", error instanceof Error ? error.message : error)
    return jsonError(500, "The overview could not be saved.", "db_error")
  }
}
