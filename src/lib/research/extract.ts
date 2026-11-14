import "server-only"
import { Readability } from "@mozilla/readability"
import { parseHTML } from "linkedom"
import sanitizeHtml from "sanitize-html"
import type { ReaderDocument } from "./types"

const MAX_CONTENT_CHARS = 600_000

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "kbd", "samp",
    "ul", "ol", "li", "dl", "dt", "dd", "a", "strong", "b", "em", "i", "u", "s", "sub", "sup", "small", "mark",
    "abbr", "cite", "q", "time", "figure", "figcaption", "img", "picture", "table", "thead", "tbody", "tfoot",
    "tr", "th", "td", "caption", "div", "span", "section", "article", "aside", "details", "summary",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading", "decoding", "referrerpolicy"],
    abbr: ["title"],
    time: ["datetime"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    ol: ["start", "reversed"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed", "svg", "math", "form", "button", "input", "select"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer nofollow" },
    }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: { ...attribs, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" },
    }),
  },
}

/** Sanitizes reader HTML. Idempotent, so stored content can be re-run through it on save. */
export function sanitizeReaderHtml(html: string): string {
  return sanitizeHtml(html.slice(0, MAX_CONTENT_CHARS), SANITIZE)
}

export function htmlToText(html: string): string {
  return sanitizeHtml(html.replace(/<\/(p|h\d|li|blockquote|pre|tr|div|figcaption)>/gi, "$&\n\n").replace(/<br\s*\/?>/gi, "\n"), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type Meta = {
  canonicalUrl: string | null
  ogSiteName: string | null
  siteName: string | null
  author: string | null
  publishedAt: string | null
  imageUrl: string | null
  lang: string | null
  title: string | null
  description: string | null
}

/** Turns a fetched HTML page into a clean, sanitized `ReaderDocument`. */
export function extractReaderDocument(input: {
  html: string
  url: string
  requestedUrl: string
  contentType: string
  headers: Headers
}): ReaderDocument {
  const base = new URL(input.url)
  const fetchedAt = new Date().toISOString()
  const embeddable = allowsFraming(input.headers, base)

  if (input.contentType.includes("text/plain")) {
    const text = input.html.slice(0, MAX_CONTENT_CHARS)
    return {
      requestedUrl: input.requestedUrl,
      url: input.url,
      canonicalUrl: null,
      title: decodeURIComponent(base.pathname.split("/").pop() || base.hostname),
      siteName: hostLabel(base),
      author: null,
      publishedAt: null,
      excerpt: text.slice(0, 240).trim() || null,
      lang: null,
      imageUrl: null,
      contentHtml: `<pre>${escapeHtml(text)}</pre>`,
      textContent: text,
      wordCount: countWords(text),
      embeddable,
      fetchedAt,
    }
  }

  const { document } = parseHTML(withBase(input.html, base))
  const meta = readMeta(document as unknown as Document, base)
  const article = new Readability(document as unknown as Document, { charThreshold: 300, keepClasses: false }).parse()

  const rawHtml = article?.content ?? (document as unknown as Document).body?.innerHTML ?? ""
  const contentHtml = sanitizeReaderHtml(rawHtml)
  const textContent = htmlToText(contentHtml)
  const title = (article?.title || meta.title || hostLabel(base)).trim()

  return {
    requestedUrl: input.requestedUrl,
    url: input.url,
    canonicalUrl: meta.canonicalUrl,
    title,
    siteName: meta.ogSiteName ?? clean(article?.siteName) ?? meta.siteName ?? hostLabel(base),
    author: clean(article?.byline) ?? meta.author,
    publishedAt: normalizeDate(clean(article?.publishedTime) ?? meta.publishedAt),
    excerpt: clean(article?.excerpt) ?? meta.description,
    lang: clean(article?.lang) ?? meta.lang,
    imageUrl: meta.imageUrl,
    contentHtml,
    textContent,
    wordCount: countWords(textContent),
    embeddable,
    fetchedAt,
  }
}

/** Live view is offered only when neither X-Frame-Options nor CSP frame-ancestors forbid other origins. */
export function allowsFraming(headers: Headers, url: URL): boolean {
  if (url.protocol !== "https:") return false
  if (headers.get("x-frame-options")) return false
  const csp = headers.get("content-security-policy")
  if (!csp) return true
  const directive = csp
    .split(/[;,]/)
    .map((d) => d.trim().toLowerCase())
    .find((d) => d.startsWith("frame-ancestors"))
  if (!directive) return true
  const sources = directive.split(/\s+/).slice(1)
  return sources.includes("*") || sources.includes("https:")
}

function withBase(html: string, url: URL): string {
  if (/<base\s[^>]*href=/i.test(html)) return html
  const tag = `<base href="${escapeHtml(url.href)}">`
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `<head>${tag}</head>${html}`
}

function readMeta(doc: Document, base: URL): Meta {
  const metaContent = (...keys: string[]) => {
    for (const key of keys) {
      const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)
      const value = clean(el?.getAttribute("content"))
      if (value) return value
    }
    return null
  }
  const ld = readJsonLd(doc)
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? metaContent("og:url")
  return {
    canonicalUrl: absoluteHttp(canonical, base),
    ogSiteName: metaContent("og:site_name"),
    siteName: metaContent("og:site_name", "application-name") ?? ld.publisher,
    author: metaContent("author", "article:author", "parsely-author", "sailthru.author") ?? ld.author,
    publishedAt:
      metaContent("article:published_time", "og:article:published_time", "datePublished", "pubdate", "date", "dc.date") ??
      ld.datePublished ??
      clean(doc.querySelector("time[datetime]")?.getAttribute("datetime")),
    imageUrl: absoluteHttp(metaContent("og:image", "twitter:image"), base),
    lang: clean(doc.documentElement?.getAttribute("lang")),
    title: metaContent("og:title", "twitter:title") ?? clean(doc.querySelector("title")?.textContent),
    description: metaContent("description", "og:description"),
  }
}

function readJsonLd(doc: Document): { author: string | null; datePublished: string | null; publisher: string | null } {
  const out = { author: null as string | null, datePublished: null as string | null, publisher: null as string | null }
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown
    try {
      data = JSON.parse(script.textContent ?? "")
    } catch {
      continue
    }
    const nodes = (Array.isArray(data) ? data : [data]).flatMap((n) =>
      n && typeof n === "object" && Array.isArray((n as { "@graph"?: unknown[] })["@graph"])
        ? (n as { "@graph": unknown[] })["@graph"]
        : [n],
    ) as Array<Record<string, unknown>>
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue
      out.datePublished ??= typeof node["datePublished"] === "string" ? node["datePublished"] : null
      out.author ??= personName(node["author"])
      out.publisher ??= personName(node["publisher"])
    }
  }
  return out
}

function personName(value: unknown): string | null {
  if (typeof value === "string") return clean(value)
  if (Array.isArray(value)) {
    const names = value.map(personName).filter(Boolean)
    return names.length ? names.join(", ") : null
  }
  if (value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string") {
    return clean((value as { name: string }).name)
  }
  return null
}

function absoluteHttp(value: string | null | undefined, base: URL): string | null {
  if (!value) return null
  try {
    const url = new URL(value, base)
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

function normalizeDate(value: string | null): string | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? value : new Date(time).toISOString()
}

function clean(value: string | null | undefined): string | null {
  const v = value?.replace(/\s+/g, " ").trim()
  return v ? v.slice(0, 500) : null
}

function hostLabel(url: URL) {
  return url.hostname.replace(/^www\./, "")
}

function countWords(text: string) {
  return text.split(/\s+/).filter(Boolean).length
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}
