import { json, jsonError, libraryFailure, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers"
import { deleteSource, getSource, normalizeTags, updateSource } from "@/lib/research/store"

type Context = { params: Promise<{ id: string }> }

/** Full stored source (article, metadata, highlights, enrichment fields); no refetch. */
export async function GET(_request: Request, { params }: Context) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  try {
    const source = await getSource(user.userId, id)
    return source ? json({ source }) : jsonError(404, "Source not found.", "not_found")
  } catch (error) {
    return libraryFailure(error)
  }
}

export async function PATCH(request: Request, { params }: Context) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  const body = await readJson(request)
  if (!body) return jsonError(400, "Invalid body.", "bad_request")
  try {
    const source = await updateSource(user.userId, id, {
      tags: "tags" in body ? normalizeTags(body["tags"]) : undefined,
      collectionId: str(body["collectionId"], 100) ?? undefined,
    })
    return source ? json({ source }) : jsonError(404, "Source not found.", "not_found")
  } catch (error) {
    return libraryFailure(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  try {
    return (await deleteSource(user.userId, id)) ? json({ ok: true }) : jsonError(404, "Source not found.", "not_found")
  } catch (error) {
    return libraryFailure(error)
  }
}
