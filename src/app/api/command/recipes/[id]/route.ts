import { commandFailure, json, jsonError, requireCommandUser, stateWith } from "@/lib/command/api"
import { getRecipe } from "@/lib/command/automation/recipes"
import { setRecipeState } from "@/lib/command/store"
import { readJson } from "@/lib/research/route-helpers"

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const { id } = await params
  if (!getRecipe(id)) return jsonError(404, "Unknown automation.", "not_found")
  const body = await readJson(request)
  if (typeof body?.["enabled"] !== "boolean") return jsonError(400, "Send { enabled: boolean }.", "invalid")
  try {
    await setRecipeState(user.userId, id, body["enabled"])
    return json(await stateWith(user.userId))
  } catch (error) {
    return commandFailure(error)
  }
}
