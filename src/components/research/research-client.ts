import type {
  ReaderDocument,
  ResearchCollection,
  ResearchSource,
  ResearchSourceSummary,
  ResearchStatus,
  SearchResponse,
  SourceHighlight,
} from "@/lib/research/types";

export type Address = { kind: "url"; url: string } | { kind: "search"; query: string };

const BARE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:[/?#]\S*)?$/i;

/** A URL opens the page; anything else is a web search. */
export function parseAddress(input: string): Address | null {
  const text = input.trim();
  if (!text) return null;
  if (/^https?:\/\//i.test(text) && !/\s/.test(text)) {
    try {
      return { kind: "url", url: new URL(text).href };
    } catch {
      return { kind: "search", query: text };
    }
  }
  if (!/\s/.test(text) && BARE_HOST.test(text)) {
    try {
      return { kind: "url", url: new URL(`https://${text}`).href };
    } catch {
      /* fall through */
    }
  }
  return { kind: "search", query: text };
}

export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const response = await fetch(path, {
    ...rest,
    headers: json === undefined ? rest.headers : { "content-type": "application/json", ...rest.headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) {
    throw new ApiFailure(data?.error ?? `Request failed (${response.status}).`, response.status, data?.code);
  }
  return data as T;
}

export const researchApi = {
  status: () => call<ResearchStatus>("/api/research/status"),
  search: (query: string, signal?: AbortSignal) =>
    call<SearchResponse>(`/api/research/search?q=${encodeURIComponent(query)}`, { signal }),
  read: (url: string, signal?: AbortSignal) =>
    call<ReaderDocument>(`/api/research/read?url=${encodeURIComponent(url)}`, { signal }),
  collections: () => call<{ collections: ResearchCollection[] }>("/api/research/collections"),
  createCollection: (name: string) =>
    call<{ collection: ResearchCollection }>("/api/research/collections", { method: "POST", json: { name } }),
  renameCollection: (id: string, name: string) =>
    call<{ collection: ResearchCollection }>(`/api/research/collections/${id}`, { method: "PATCH", json: { name } }),
  deleteCollection: (id: string) => call<{ ok: true }>(`/api/research/collections/${id}`, { method: "DELETE" }),
  sources: (collectionId: string) =>
    call<{ sources: ResearchSourceSummary[] }>(`/api/research/collections/${collectionId}/sources`),
  source: (id: string, signal?: AbortSignal) => call<{ source: ResearchSource }>(`/api/research/sources/${id}`, { signal }),
  saveSource: (collectionId: string, document: ReaderDocument, tags: string[]) =>
    call<{ source: ResearchSourceSummary }>("/api/research/sources", {
      method: "POST",
      json: { collectionId, document, tags },
    }),
  updateSource: (id: string, patch: { tags?: string[]; collectionId?: string }) =>
    call<{ source: ResearchSourceSummary }>(`/api/research/sources/${id}`, { method: "PATCH", json: patch }),
  deleteSource: (id: string) => call<{ ok: true }>(`/api/research/sources/${id}`, { method: "DELETE" }),
  addHighlight: (sourceId: string, input: { quote: string; prefix: string; suffix: string; note?: string | null }) =>
    call<{ highlight: SourceHighlight }>(`/api/research/sources/${sourceId}/highlights`, { method: "POST", json: input }),
  deleteHighlight: (id: string) => call<{ ok: true }>(`/api/research/highlights/${id}`, { method: "DELETE" }),
};

/** A stored source rendered through the same reader as a live page. */
export function sourceToDocument(source: ResearchSource): ReaderDocument {
  return {
    requestedUrl: source.url,
    url: source.url,
    canonicalUrl: source.canonicalUrl,
    title: source.title,
    siteName: source.siteName,
    author: source.author,
    publishedAt: source.publishedAt,
    excerpt: source.excerpt,
    lang: source.lang,
    imageUrl: source.imageUrl,
    contentHtml: source.contentHtml,
    textContent: source.textContent,
    wordCount: source.wordCount,
    embeddable: false,
    fetchedAt: source.fetchedAt,
  };
}
