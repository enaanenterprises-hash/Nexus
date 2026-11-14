import { json, jsonError, libraryFailure, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers"
import { deleteCollection, updateCollection } from "@/lib/research/store"

type Context = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Context) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  const body = await readJson(request)
  if (!body) return jsonError(400, "Invalid body.", "bad_request")
  try {
    const collection = await updateCollection(user.userId, id, {
      name: str(body["name"], 80) ?? undefined,
      description: "description" in body ? str(body["description"], 500) : undefined,
    })
    return collection ? json({ collection }) : jsonError(404, "Collection not found.", "not_found")
  } catch (error) {
    return libraryFailure(error)
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  try {
    return (await deleteCollection(user.userId, id)) ? json({ ok: true }) : jsonError(404, "Collection not found.", "not_found")
  } catch (error) {
    return libraryFailure(error)
  }
}
