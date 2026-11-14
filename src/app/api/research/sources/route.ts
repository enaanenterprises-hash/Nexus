import { after } from "next/server"
import { runSourceAnalyzers } from "@/lib/research/analyzers"
import { json, jsonError, libraryFailure, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers"
import { normalizeTags, saveSource } from "@/lib/research/store"
import type { ReaderDocument } from "@/lib/research/types"

const MAX_HTML = 1_000_000

function httpUrl(value: unknown): string | null {
  const raw = str(value, 4000)
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

/** Save the page currently open in the reader into a collection. */
export async function POST(request: Request) {
  const user = await requireLibraryUser()
  if ("response" in user) return user.response
  const body = await readJson(request)
  const collectionId = str(body?.["collectionId"], 100)
  const raw = body?.["document"] as Record<string, unknown> | undefined
  const url = httpUrl(raw?.["url"])
  const contentHtml = typeof raw?.["contentHtml"] === "string" ? raw["contentHtml"] : null
  if (!collectionId || !raw || !url || contentHtml === null) {
    return jsonError(400, "Missing collection or page.", "bad_request")
  }
  if (contentHtml.length > MAX_HTML) return jsonError(413, "This page is too large to save.", "too_large")

  const doc: ReaderDocument = {
    requestedUrl: url,
    url,
    canonicalUrl: httpUrl(raw["canonicalUrl"]),
    title: str(raw["title"], 500) ?? new URL(url).hostname,
    siteName: str(raw["siteName"], 200),
    author: str(raw["author"], 300),
    publishedAt: str(raw["publishedAt"], 100),
    excerpt: str(raw["excerpt"], 1000),
    lang: str(raw["lang"], 20),
    imageUrl: httpUrl(raw["imageUrl"]),
    contentHtml,
    textContent: "",
    wordCount: 0,
    embeddable: false,
    fetchedAt: (() => {
      const t = Date.parse(String(raw["fetchedAt"] ?? ""))
      return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString()
    })(),
  }

  try {
    const source = await saveSource(user.userId, collectionId, doc, normalizeTags(body?.["tags"]))
    if (!source) return jsonError(404, "Collection not found.", "not_found")
    after(() => runSourceAnalyzers(user.userId, source.id))
    return json({ source }, { status: 201 })
  } catch (error) {
    return libraryFailure(error)
  }
}
