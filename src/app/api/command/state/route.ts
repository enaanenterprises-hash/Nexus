import { commandFailure, json, requireCommandUser, stateWith } from "@/lib/command/api"

export async function GET() {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  try {
    return json(await stateWith(user.userId))
  } catch (error) {
    return commandFailure(error)
  }
}
