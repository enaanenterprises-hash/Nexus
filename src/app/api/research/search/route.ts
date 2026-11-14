import { json, jsonError, requireUser } from "@/lib/research/route-helpers"
import { webSearch } from "@/lib/research/search"

export async function GET(request: Request) {
  const user = await requireUser()
  if ("response" in user) return user.response
  const params = new URL(request.url).searchParams
  const query = params.get("q")?.trim().slice(0, 400)
  if (!query) return jsonError(400, "Type something to search for.", "bad_request")
  const page = Math.min(9, Math.max(0, Number(params.get("page")) || 0))
  return json(await webSearch(query, page))
}
