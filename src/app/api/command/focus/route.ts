import { commandFailure, json, jsonError, requireCommandUser, stateWith, timeZoneFrom } from "@/lib/command/api"
import { COMMAND_DRIVERS } from "@/lib/command/drivers"
import { endFocus, startFocus } from "@/lib/command/service"
import { readJson, str } from "@/lib/research/route-helpers"

export async function POST(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const title = str(body?.["title"], 200)
  const minutes = Number(body?.["minutes"])
  if (!title) return jsonError(400, "Give the session a title.", "invalid")
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) return jsonError(400, "Minutes must be 5–240.", "invalid")
  try {
    const result = await startFocus({
      userId: user.userId,
      timeZone: timeZoneFrom(body?.["timeZone"]),
      drivers: COMMAND_DRIVERS,
      title,
      minutes,
      targetItemId: str(body?.["targetItemId"], 300),
    })
    return json(await stateWith(user.userId, result))
  } catch (error) {
    return commandFailure(error)
  }
}

export async function DELETE(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  try {
    const result = await endFocus({ userId: user.userId, timeZone: timeZoneFrom(body?.["timeZone"]), drivers: COMMAND_DRIVERS })
    return json(await stateWith(user.userId, result))
  } catch (error) {
    return commandFailure(error)
  }
}
