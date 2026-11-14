import "server-only"
import { randomUUID } from "node:crypto"
import { ensureResearchSchema, getSql } from "@/lib/db/client"
import { htmlToText, sanitizeReaderHtml } from "./extract"
import type {
  ReaderDocument,
  ResearchCollection,
  ResearchSource,
  ResearchSourceSummary,
  SourceHighlight,
  SourceLean,
  SourceNotes,
  SourceSummary,
} from "./types"

/** Every query is scoped by `userId`; ids from the client are never trusted on their own. */

type Row = Record<string, unknown>

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  const time = Date.parse(String(value))
  return Number.isNaN(time) ? String(value) : new Date(time).toISOString()
}

export const MAX_TAGS = 12
export const DEFAULT_COLLECTION_NAME = "My research"

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return []
  const out = new Set<string>()
  for (const tag of tags) {
    if (typeof tag !== "string") continue
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32)
    if (t) out.add(t)
  }
  return [...out].slice(0, MAX_TAGS)
}

async function db() {
  await ensureResearchSchema()
  return getSql()
}

function toCollection(row: Row): ResearchCollection {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    description: (row["description"] as string | null) ?? null,
    sourceCount: Number(row["sourceCount"] ?? 0),
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
  }
}

function toSummary(row: Row): ResearchSourceSummary {
  return {
    id: String(row["id"]),
    collectionId: String(row["collectionId"]),
    url: String(row["url"]),
    canonicalUrl: (row["canonicalUrl"] as string | null) ?? null,
    title: String(row["title"]),
    siteName: (row["siteName"] as string | null) ?? null,
    author: (row["author"] as string | null) ?? null,
    publishedAt: (row["publishedAt"] as string | null) ?? null,
    excerpt: (row["excerpt"] as string | null) ?? null,
    tags: (row["tags"] as string[] | null) ?? [],
    wordCount: Number(row["wordCount"] ?? 0),
    highlightCount: Number(row["highlightCount"] ?? 0),
    savedAt: iso(row["savedAt"]),
    updatedAt: iso(row["updatedAt"] ?? row["savedAt"]),
  }
}

function toHighlight(row: Row): SourceHighlight {
  return {
    id: String(row["id"]),
    sourceId: String(row["sourceId"]),
    quote: String(row["quote"]),
    prefix: String(row["prefix"] ?? ""),
    suffix: String(row["suffix"] ?? ""),
    note: (row["note"] as string | null) ?? null,
    createdAt: iso(row["createdAt"]),
  }
}

export async function listCollections(userId: string, options: { createDefault?: boolean } = {}): Promise<ResearchCollection[]> {
  const sql = await db()
  const rows = await sql`
    SELECT c.*, (SELECT count(*) FROM "research_source" s WHERE s."collectionId" = c."id")::int AS "sourceCount"
    FROM "research_collection" c
    WHERE c."userId" = ${userId}
    ORDER BY c."updatedAt" DESC`
  if (rows.length > 0 || options.createDefault === false) return rows.map(toCollection)
  return [await createCollection(userId, DEFAULT_COLLECTION_NAME, null)]
}

export async function createCollection(userId: string, name: string, description: string | null) {
  const sql = await db()
  const [row] = await sql`
    INSERT INTO "research_collection" ("id", "userId", "name", "description")
    VALUES (${randomUUID()}, ${userId}, ${name.slice(0, 80)}, ${description?.slice(0, 500) ?? null})
    RETURNING *, 0 AS "sourceCount"`
  return toCollection(row!)
}

export async function updateCollection(userId: string, id: string, patch: { name?: string; description?: string | null }) {
  const sql = await db()
  const [row] = await sql`
    UPDATE "research_collection" SET
      "name" = COALESCE(${patch.name?.slice(0, 80) ?? null}, "name"),
      "description" = ${patch.description === undefined ? sql`"description"` : (patch.description?.slice(0, 500) ?? null)},
      "updatedAt" = now()
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING *, (SELECT count(*) FROM "research_source" s WHERE s."collectionId" = ${id})::int AS "sourceCount"`
  return row ? toCollection(row) : null
}

export async function deleteCollection(userId: string, id: string) {
  const sql = await db()
  const rows = await sql`DELETE FROM "research_collection" WHERE "id" = ${id} AND "userId" = ${userId} RETURNING "id"`
  return rows.length > 0
}

export async function listSources(userId: string, collectionId: string): Promise<ResearchSourceSummary[]> {
  const sql = await db()
  const rows = await sql`
    SELECT s."id", s."collectionId", s."url", s."canonicalUrl", s."title", s."siteName", s."author", s."publishedAt",
      s."excerpt", s."tags", s."wordCount", s."savedAt", s."updatedAt",
      (SELECT count(*) FROM "research_highlight" h WHERE h."sourceId" = s."id")::int AS "highlightCount"
    FROM "research_source" s
    WHERE s."userId" = ${userId} AND s."collectionId" = ${collectionId}
    ORDER BY s."savedAt" DESC`
  return rows.map(toSummary)
}

export async function getSource(userId: string, id: string): Promise<ResearchSource | null> {
  const sql = await db()
  const [row] = await sql`SELECT * FROM "research_source" WHERE "id" = ${id} AND "userId" = ${userId}`
  if (!row) return null
  const highlights = await sql`
    SELECT * FROM "research_highlight" WHERE "sourceId" = ${id} AND "userId" = ${userId} ORDER BY "createdAt"`
  return {
    ...toSummary({ ...row, highlightCount: highlights.length }),
    lang: (row["lang"] as string | null) ?? null,
    imageUrl: (row["imageUrl"] as string | null) ?? null,
    contentHtml: String(row["contentHtml"]),
    textContent: String(row["textContent"]),
    fetchedAt: iso(row["fetchedAt"]),
    highlights: highlights.map(toHighlight),
    summary: (row["summary"] as SourceSummary | null) ?? null,
    notes: (row["notes"] as SourceNotes | null) ?? null,
    lean: (row["lean"] as SourceLean | null) ?? null,
  }
}

/** Upserts by (collection, url). Content is re-sanitized; the client copy is never stored as-is. */
export async function saveSource(
  userId: string,
  collectionId: string,
  doc: ReaderDocument,
  tags: string[],
): Promise<ResearchSourceSummary | null> {
  const sql = await db()
  const [owned] = await sql`SELECT 1 FROM "research_collection" WHERE "id" = ${collectionId} AND "userId" = ${userId}`
  if (!owned) return null
  const contentHtml = sanitizeReaderHtml(doc.contentHtml)
  const textContent = htmlToText(contentHtml)
  const [row] = await sql`
    INSERT INTO "research_source" (
      "id", "userId", "collectionId", "url", "canonicalUrl", "title", "siteName", "author", "publishedAt",
      "excerpt", "lang", "imageUrl", "contentHtml", "textContent", "wordCount", "tags", "fetchedAt"
    ) VALUES (
      ${randomUUID()}, ${userId}, ${collectionId}, ${doc.url}, ${doc.canonicalUrl}, ${doc.title.slice(0, 500)},
      ${doc.siteName}, ${doc.author}, ${doc.publishedAt}, ${doc.excerpt}, ${doc.lang}, ${doc.imageUrl},
      ${contentHtml}, ${textContent}, ${textContent.split(/\s+/).filter(Boolean).length}, ${tags},
      ${doc.fetchedAt}
    )
    ON CONFLICT ("collectionId", "url") DO UPDATE SET
      "title" = EXCLUDED."title", "canonicalUrl" = EXCLUDED."canonicalUrl", "siteName" = EXCLUDED."siteName",
      "author" = EXCLUDED."author", "publishedAt" = EXCLUDED."publishedAt", "excerpt" = EXCLUDED."excerpt",
      "lang" = EXCLUDED."lang", "imageUrl" = EXCLUDED."imageUrl", "contentHtml" = EXCLUDED."contentHtml",
      "textContent" = EXCLUDED."textContent", "wordCount" = EXCLUDED."wordCount", "fetchedAt" = EXCLUDED."fetchedAt",
      "tags" = (SELECT ARRAY(SELECT DISTINCT unnest("research_source"."tags" || EXCLUDED."tags"))),
      "updatedAt" = now()
    RETURNING *, (SELECT count(*) FROM "research_highlight" h WHERE h."sourceId" = "research_source"."id")::int AS "highlightCount"`
  await sql`UPDATE "research_collection" SET "updatedAt" = now() WHERE "id" = ${collectionId}`
  return toSummary(row!)
}

export async function updateSource(userId: string, id: string, patch: { tags?: string[]; collectionId?: string }) {
  const sql = await db()
  if (patch.collectionId) {
    const [owned] = await sql`SELECT 1 FROM "research_collection" WHERE "id" = ${patch.collectionId} AND "userId" = ${userId}`
    if (!owned) return null
  }
  const [row] = await sql`
    UPDATE "research_source" SET
      "tags" = ${patch.tags ? patch.tags : sql`"tags"`},
      "collectionId" = COALESCE(${patch.collectionId ?? null}, "collectionId"),
      "updatedAt" = now()
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING *, (SELECT count(*) FROM "research_highlight" h WHERE h."sourceId" = ${id})::int AS "highlightCount"`
  return row ? toSummary(row) : null
}

export async function deleteSource(userId: string, id: string) {
  const sql = await db()
  const rows = await sql`DELETE FROM "research_source" WHERE "id" = ${id} AND "userId" = ${userId} RETURNING "id"`
  return rows.length > 0
}

export async function addHighlight(
  userId: string,
  sourceId: string,
  input: { quote: string; prefix: string; suffix: string; note: string | null },
): Promise<SourceHighlight | null> {
  const sql = await db()
  const [owned] = await sql`SELECT 1 FROM "research_source" WHERE "id" = ${sourceId} AND "userId" = ${userId}`
  if (!owned) return null
  const [row] = await sql`
    INSERT INTO "research_highlight" ("id", "userId", "sourceId", "quote", "prefix", "suffix", "note")
    VALUES (${randomUUID()}, ${userId}, ${sourceId}, ${input.quote.slice(0, 4000)}, ${input.prefix.slice(-64)},
      ${input.suffix.slice(0, 64)}, ${input.note?.slice(0, 2000) ?? null})
    RETURNING *`
  return toHighlight(row!)
}

export async function deleteHighlight(userId: string, id: string) {
  const sql = await db()
  const rows = await sql`DELETE FROM "research_highlight" WHERE "id" = ${id} AND "userId" = ${userId} RETURNING "id"`
  return rows.length > 0
}

type Enrichment = { summary: SourceSummary; notes: SourceNotes; lean: SourceLean }

/** Write path for analyzers. Not called by any UI yet. */
export async function setSourceEnrichment<K extends keyof Enrichment>(
  userId: string,
  id: string,
  field: K,
  value: Enrichment[K] | null,
) {
  const sql = await db()
  const json = value === null ? null : JSON.stringify(value)
  if (field === "summary") await sql`UPDATE "research_source" SET "summary" = ${json}::jsonb, "updatedAt" = now() WHERE "id" = ${id} AND "userId" = ${userId}`
  else if (field === "notes") await sql`UPDATE "research_source" SET "notes" = ${json}::jsonb, "updatedAt" = now() WHERE "id" = ${id} AND "userId" = ${userId}`
  else await sql`UPDATE "research_source" SET "lean" = ${json}::jsonb, "updatedAt" = now() WHERE "id" = ${id} AND "userId" = ${userId}`
}
