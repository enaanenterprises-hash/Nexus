import { commandFailure, json, requireCommandUser, stateWith, timeZoneFrom } from "@/lib/command/api"
import { COMMAND_DRIVERS } from "@/lib/command/drivers"
import { syncCommand } from "@/lib/command/service"
import { readJson } from "@/lib/research/route-helpers"

export const maxDuration = 60

export async function POST(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  try {
    const result = await syncCommand({ userId: user.userId, timeZone: timeZoneFrom(body?.["timeZone"]), drivers: COMMAND_DRIVERS })
    return json(await stateWith(user.userId, result))
  } catch (error) {
    return commandFailure(error)
  }
}
