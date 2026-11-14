import { extractReaderDocument } from "@/lib/research/extract"
import { json, jsonError, requireUser } from "@/lib/research/route-helpers"
import { FetchPageError, fetchPublicPage } from "@/lib/research/safe-fetch"

const STATUS: Record<FetchPageError["code"], number> = {
  blocked: 400,
  unsupported: 415,
  too_large: 413,
  timeout: 504,
  http: 502,
  network: 502,
}

export async function GET(request: Request) {
  const user = await requireUser()
  if ("response" in user) return user.response
  const requested = new URL(request.url).searchParams.get("url")?.trim()
  if (!requested) return jsonError(400, "Missing url.", "bad_request")

  try {
    const page = await fetchPublicPage(requested)
    const doc = extractReaderDocument({
      html: page.body,
      url: page.url,
      requestedUrl: requested,
      contentType: page.contentType,
      headers: page.headers,
    })
    return json(doc)
  } catch (error) {
    if (error instanceof FetchPageError) return jsonError(STATUS[error.code], error.message, error.code)
    console.error("[research] reader failed", error)
    return jsonError(500, "This page could not be turned into a readable article.", "extract_failed")
  }
}
