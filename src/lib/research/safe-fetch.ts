import "server-only"
import { Agent, fetch as undiciFetch } from "undici"
import { BlockedUrlError, assertFetchableUrl, guardedLookup } from "./net-guard"

export const MAX_PAGE_BYTES = 3 * 1024 * 1024
export const FETCH_TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 5

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 NexusResearch/0.1"

const agent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8_000 },
  headersTimeout: FETCH_TIMEOUT_MS,
  bodyTimeout: FETCH_TIMEOUT_MS,
})

export class FetchPageError extends Error {
  constructor(
    message: string,
    readonly code: "blocked" | "timeout" | "too_large" | "http" | "unsupported" | "network",
    readonly status?: number,
  ) {
    super(message)
    this.name = "FetchPageError"
  }
}

export interface FetchedPage {
  url: string
  status: number
  contentType: string
  headers: Headers
  body: string
}

/** Fetches a public web page with SSRF guards, manual redirects, and size / time caps. */
export async function fetchPublicPage(rawUrl: string): Promise<FetchedPage> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  let current = guard(rawUrl)

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await undiciFetch(current, {
        dispatcher: agent,
        redirect: "manual",
        signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5",
          "accept-language": "en-US,en;q=0.9",
        },
      })

      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        await response.body?.cancel()
        current = guard(new URL(response.headers.get("location")!, current))
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new FetchPageError(`The site answered with ${response.status}.`, "http", response.status)
      }

      const contentType = (response.headers.get("content-type") ?? "").toLowerCase()
      if (!/text\/html|application\/xhtml\+xml|text\/plain/.test(contentType) && contentType !== "") {
        await response.body?.cancel()
        throw new FetchPageError(
          `This is not a web page (${contentType.split(";")[0]}). Open the original instead.`,
          "unsupported",
        )
      }
      const declared = Number(response.headers.get("content-length") ?? 0)
      if (declared > MAX_PAGE_BYTES) {
        await response.body?.cancel()
        throw new FetchPageError("This page is too large to read here.", "too_large")
      }

      const bytes = await readCapped(response.body as ReadableStream<Uint8Array> | null)
      return {
        url: current.href,
        status: response.status,
        contentType,
        headers: response.headers as unknown as Headers,
        body: decode(bytes, contentType),
      }
    }
    throw new FetchPageError("Too many redirects.", "http")
  } catch (error) {
    throw normalizeError(error)
  }
}

function guard(url: string | URL): URL {
  try {
    return assertFetchableUrl(url)
  } catch (error) {
    throw new FetchPageError((error as Error).message, "blocked")
  }
}

async function readCapped(body: ReadableStream<Uint8Array> | null): Promise<Uint8Array> {
  if (!body) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel()
      throw new FetchPageError("This page is too large to read here.", "too_large")
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function decode(bytes: Uint8Array, contentType: string): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048))
  const charset =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8"
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
}

function normalizeError(error: unknown): FetchPageError {
  if (error instanceof FetchPageError) return error
  if (error instanceof BlockedUrlError) return new FetchPageError(error.message, "blocked")
  const err = error as { name?: string; cause?: { code?: string; message?: string; name?: string } }
  if (err.name === "TimeoutError" || err.name === "AbortError" || err.cause?.code === "UND_ERR_CONNECT_TIMEOUT") {
    return new FetchPageError("The site took too long to respond.", "timeout")
  }
  if (err.cause?.name === "BlockedUrlError" || err.cause?.code === "EBLOCKED") {
    return new FetchPageError(err.cause.message ?? "That host is not allowed.", "blocked")
  }
  if (err.cause?.code === "ENOTFOUND") return new FetchPageError("That site could not be found.", "network")
  return new FetchPageError("The page could not be reached.", "network")
}
