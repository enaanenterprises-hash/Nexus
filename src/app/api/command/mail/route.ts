import { json, jsonError, requireCommandUser, timeZoneFrom } from "@/lib/command/api"
import { COMMAND_DRIVERS } from "@/lib/command/drivers"
import { describeError, readMail, sendMail } from "@/lib/command/service"
import { readJson, str } from "@/lib/research/route-helpers"

export const maxDuration = 30

/** One message, using the read-only Gmail grant. */
export async function GET(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? ""
  if (!id) return jsonError(400, "Choose a message to read.", "invalid")
  try {
    return json(await readMail({ userId: user.userId, messageId: id, timeZone: timeZoneFrom(new URL(request.url).searchParams.get("timeZone")) }))
  } catch (error) {
    const { message, status } = describeError(error)
    return jsonError(status === "needs_auth" ? 403 : 400, message, status === "needs_auth" ? "needs_auth" : "read_failed")
  }
}

/** Compose or reply through Gmail (`gmail.send` grant). */
export async function POST(request: Request) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const to = str(body?.["to"], 2000)
  if (!to) return jsonError(400, "Add at least one recipient.", "invalid")
  try {
    const result = await sendMail({
      userId: user.userId,
      timeZone: timeZoneFrom(body?.["timeZone"]),
      drivers: COMMAND_DRIVERS,
      message: {
        to,
        cc: str(body?.["cc"], 2000) ?? undefined,
        subject: typeof body?.["subject"] === "string" ? body["subject"] : "",
        body: typeof body?.["body"] === "string" ? body["body"] : "",
        threadId: str(body?.["threadId"], 200),
        inReplyTo: str(body?.["inReplyTo"], 500),
      },
    })
    return json(result)
  } catch (error) {
    const { message, status } = describeError(error)
    return jsonError(status === "needs_auth" ? 403 : 400, message, status === "needs_auth" ? "needs_auth" : "send_failed")
  }
}
