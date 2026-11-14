import { json, jsonError, libraryFailure, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers"
import { addHighlight } from "@/lib/research/store"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const { id } = await params
  const body = await readJson(request)
  const quote = str(body?.["quote"], 4000)
  if (!quote) return jsonError(400, "Select some text to highlight.", "bad_request")
  try {
    const highlight = await addHighlight(user.userId, id, {
      quote,
      prefix: typeof body?.["prefix"] === "string" ? body["prefix"] : "",
      suffix: typeof body?.["suffix"] === "string" ? body["suffix"] : "",
      note: str(body?.["note"], 2000),
    })
    return highlight ? json({ highlight }, { status: 201 }) : jsonError(404, "Source not found.", "not_found")
  } catch (error) {
    return libraryFailure(error)
  }
}
