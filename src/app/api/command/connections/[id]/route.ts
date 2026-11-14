import { commandFailure, json, requireCommandUser, stateWith } from "@/lib/command/api"
import { deleteConnection } from "@/lib/command/store"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCommandUser()
  if ("response" in user) return user.response
  const { id } = await params
  try {
    await deleteConnection(user.userId, id)
    return json(await stateWith(user.userId))
  } catch (error) {
    return commandFailure(error)
  }
}
