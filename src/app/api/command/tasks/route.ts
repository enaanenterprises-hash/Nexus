import { json, jsonError, requireCommandUser, stateWith, timeZoneFrom } from "@/lib/command/api"
import { createTaskItem, describeError, toggleTaskItem } from "@/lib/command/service"
import { readJson, str } from "@/lib/research/route-helpers"

export const maxDuration = 30

/** Create a task (Google Tasks if connected, else Command). */
export async function POST(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const title = str(body?.["title"], 240)
  if (!title) return jsonError(400, "Enter a task title.", "invalid")
  const dueAt = str(body?.["dueAt"], 64)
  try {
    const result = await createTaskItem({
      userId: user.userId,
      timeZone: timeZoneFrom(body?.["timeZone"]),
      title,
      dueAt,
    })
    return json(await stateWith(user.userId, result))
  } catch (error) {
    const { message, status } = describeError(error)
    return jsonError(status === "needs_auth" ? 403 : 400, message, status === "needs_auth" ? "needs_auth" : "task_failed")
  }
}

/** Toggle open/done status on a task item. */
export async function PATCH(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const id = str(body?.["id"], 200)
  const done = body?.["done"]
  if (!id || typeof done !== "boolean") return jsonError(400, "Missing task id or done flag.", "invalid")
  try {
    await toggleTaskItem({
      userId: user.userId,
      timeZone: timeZoneFrom(body?.["timeZone"]),
      itemId: id,
      done,
    })
    return json(await stateWith(user.userId))
  } catch (error) {
    const { message, status } = describeError(error)
    return jsonError(status === "needs_auth" ? 403 : 400, message, status === "needs_auth" ? "needs_auth" : "task_failed")
  }
}
