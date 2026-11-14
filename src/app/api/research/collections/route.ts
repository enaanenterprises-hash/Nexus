import { json, jsonError, libraryFailure, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers"
import { createCollection, listCollections } from "@/lib/research/store"

export async function GET() {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  try {
    return json({ collections: await listCollections(user.userId) })
  } catch (error) {
    return libraryFailure(error)
  }
}

export async function POST(request: Request) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const name = str(body?.["name"], 80)
  if (!name) return jsonError(400, "Give the collection a name.", "bad_request")
  try {
    return json({ collection: await createCollection(user.userId, name, str(body?.["description"], 500)) }, { status: 201 })
  } catch (error) {
    return libraryFailure(error)
  }
}
