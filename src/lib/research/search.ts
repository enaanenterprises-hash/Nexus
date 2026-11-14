import "server-only"
import type { SearchResponse, SearchResult } from "./types"

/**
 * Server-side web search. Add a provider by implementing this interface and
 * listing it in `PROVIDERS`; the first configured one is used.
 */
export interface SearchProvider {
  id: string
  label: string
  /** Env vars this provider needs, shown in the "not configured" notice. */
  requiredEnv: string[]
  isConfigured(): boolean
  search(query: string, options: { count: number; offset: number; signal: AbortSignal }): Promise<SearchResult[]>
}

const braveSearch: SearchProvider = {
  id: "brave",
  label: "Brave Search",
  requiredEnv: ["BRAVE_SEARCH_API_KEY"],
  isConfigured: () => Boolean(process.env["BRAVE_SEARCH_API_KEY"]?.trim()),
  async search(query, { count, offset, signal }) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search")
    url.searchParams.set("q", query)
    url.searchParams.set("count", String(count))
    url.searchParams.set("offset", String(offset))
    url.searchParams.set("safesearch", "moderate")
    const response = await fetch(url, {
      signal,
      cache: "no-store",
      headers: {
        accept: "application/json",
        "x-subscription-token": process.env["BRAVE_SEARCH_API_KEY"]!.trim(),
      },
    })
    if (!response.ok) throw new Error(`Brave Search answered ${response.status}`)
    const data = (await response.json()) as {
      web?: {
        results?: Array<{
          title?: string
          url?: string
          description?: string
          age?: string
          profile?: { name?: string }
          meta_url?: { hostname?: string }
          thumbnail?: { src?: string }
        }>
      }
    }
    return (data.web?.results ?? []).flatMap((r) =>
      r.url && r.title
        ? [
            {
              title: stripTags(r.title),
              url: r.url,
              description: stripTags(r.description ?? ""),
              siteName: r.profile?.name ?? r.meta_url?.hostname?.replace(/^www\./, "") ?? null,
              age: r.age ?? null,
              thumbnailUrl: r.thumbnail?.src ?? null,
            },
          ]
        : [],
    )
  },
}

const PROVIDERS: SearchProvider[] = [braveSearch]

export function activeSearchProvider(): SearchProvider | null {
  return PROVIDERS.find((p) => p.isConfigured()) ?? null
}

export async function webSearch(query: string, page = 0): Promise<SearchResponse> {
  const provider = activeSearchProvider()
  if (!provider) {
    return {
      ok: false,
      provider: null,
      query,
      reason: "not_configured",
      message: `Add ${PROVIDERS[0]!.requiredEnv.join(", ")} on the server to enable web search. You can still open any address directly.`,
    }
  }
  try {
    const results = await provider.search(query, { count: 10, offset: page, signal: AbortSignal.timeout(8_000) })
    return { ok: true, provider: provider.label, query, results }
  } catch (error) {
    console.error("[research] search failed", (error as Error).message)
    return { ok: false, provider: provider.label, query, reason: "failed", message: `${provider.label} did not answer. Try again in a moment.` }
  }
}

function stripTags(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}
