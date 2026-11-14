import { commandFailure, json, jsonError, requireCommandUser, stateWith, timeZoneFrom } from "@/lib/command/api"
import { localDay, zonedDate } from "@/lib/command/drivers/time"
import { createGoal } from "@/lib/command/service"
import { readJson } from "@/lib/research/route-helpers"

const GOALS = {
  run: { metric: "run.distance_km", unit: "km", title: (t: number) => `Run ${t} km` },
} as const

export async function POST(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const type = String(body?.["type"] ?? "") as keyof typeof GOALS
  const target = Number(body?.["target"])
  if (!Object.hasOwn(GOALS, type)) return jsonError(400, "Unknown goal type.", "invalid")
  if (!Number.isFinite(target) || target <= 0 || target > 200) return jsonError(400, "Target must be between 0 and 200.", "invalid")
  const tz = timeZoneFrom(body?.["timeZone"])
  const goal = GOALS[type]
  try {
    await createGoal(user.userId, {
      title: goal.title(target),
      metric: goal.metric,
      target,
      unit: goal.unit,
      dueAt: zonedDate(localDay(new Date(), tz), "23:59", tz).toISOString(),
    })
    return json(await stateWith(user.userId))
  } catch (error) {
    return commandFailure(error)
  }
}
