import { json, jsonError, libraryFailure, requireLibraryUser } from "@/lib/research/route-helpers"
import { deleteHighlight } from "@/lib/research/store"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  try {
    return (await deleteHighlight(user.userId, id)) ? json({ ok: true }) : jsonError(404, "Highlight not found.", "not_found")
  } catch (error) {
    return libraryFailure(error)
  }
}
