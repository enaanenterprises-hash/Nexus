import { json, libraryFailure, requireLibraryUser } from "@/lib/research/route-helpers"
import { listSources } from "@/lib/research/store"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  try {
    return json({ sources: await listSources(user.userId, id) })
  } catch (error) {
    return libraryFailure(error)
  }
}
