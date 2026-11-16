import { json, jsonError, requireCommandUser, stateWith, timeZoneFrom } from "@/lib/command/api"
import { createCalendarEvent, describeError } from "@/lib/command/service"
import { readJson, str } from "@/lib/research/route-helpers"

export const maxDuration = 30

/** Schedule an event on Google Calendar from the Calendar widget. */
export async function POST(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const title = str(body?.["title"], 200)
  const startsAtRaw = str(body?.["startsAt"], 80)
  const endsAtRaw = str(body?.["endsAt"], 80)
  if (!title || !startsAtRaw || !endsAtRaw) return jsonError(400, "Provide title, start, and end times.", "invalid")
  const startMs = Date.parse(startsAtRaw)
  const endMs = Date.parse(endsAtRaw)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs > 24 * 3_600_000) {
    return jsonError(400, "Choose a valid start and end window (under 24 hours).", "invalid")
  }
  try {
    const result = await createCalendarEvent({
      userId: user.userId,
      timeZone: timeZoneFrom(body?.["timeZone"]),
      title,
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(endMs).toISOString(),
    })
    return json(await stateWith(user.userId, result))
  } catch (error) {
    const { message, status } = describeError(error)
    return jsonError(status === "needs_auth" ? 403 : 400, message, status === "needs_auth" ? "needs_auth" : "calendar_failed")
  }
}
