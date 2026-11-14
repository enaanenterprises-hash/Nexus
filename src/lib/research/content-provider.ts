import "server-only"
import { ContentAccessError, type ContentProvider } from "@/lib/content/provider"
import { getSource, listCollections, listSources, setSourceEnrichment } from "./store"
import type {
  ResearchSource,
  ResearchSourceContentV1,
  ResearchSourceListItemV1,
  ResearchSourceSummary,
  SourceNotes,
  SourceSummary,
  WriteNotesInput,
  WriteSummaryInput,
} from "./types"

const LIMITS = { summary: 20_000, keyPoints: 20, keyPoint: 500, model: 100, notes: 100_000 }

export function parseSummaryInput(value: unknown): WriteSummaryInput {
  const v = value as Partial<WriteSummaryInput> | null
  const text = typeof v?.text === "string" ? v.text.trim() : ""
  const model = typeof v?.model === "string" ? v.model.trim() : ""
  if (!text || text.length > LIMITS.summary) throw new ContentAccessError(`summary.text must be 1–${LIMITS.summary} characters`, "invalid")
  if (!model || model.length > LIMITS.model) throw new ContentAccessError(`summary.model must be 1–${LIMITS.model} characters`, "invalid")
  const keyPoints = v?.keyPoints ?? []
  if (!Array.isArray(keyPoints) || keyPoints.length > LIMITS.keyPoints || keyPoints.some((p) => typeof p !== "string" || p.length > LIMITS.keyPoint)) {
    throw new ContentAccessError(`summary.keyPoints must be up to ${LIMITS.keyPoints} strings`, "invalid")
  }
  return { text, model, keyPoints: keyPoints.map((p) => p.trim()).filter(Boolean) }
}

export function parseNotesInput(value: unknown): WriteNotesInput {
  const body = typeof (value as WriteNotesInput | null)?.body === "string" ? (value as WriteNotesInput).body : ""
  if (!body.trim() || body.length > LIMITS.notes) throw new ContentAccessError(`notes.body must be 1–${LIMITS.notes} characters`, "invalid")
  return { body }
}

function listItem(s: ResearchSourceSummary): ResearchSourceListItemV1 {
  return {
    kind: "research.source",
    version: 1,
    id: s.id,
    title: s.title,
    collectionId: s.collectionId,
    createdAt: s.savedAt,
    updatedAt: s.updatedAt,
    data: {
      url: s.url,
      canonicalUrl: s.canonicalUrl,
      siteName: s.siteName,
      author: s.author,
      publishedAt: s.publishedAt,
      excerpt: s.excerpt,
      tags: s.tags,
      wordCount: s.wordCount,
      highlightCount: s.highlightCount,
    },
  }
}

function item(s: ResearchSource): ResearchSourceContentV1 {
  const { data, ...envelope } = listItem(s)
  const { highlightCount, ...meta } = data
  void highlightCount
  return {
    ...envelope,
    data: {
      ...meta,
      lang: s.lang,
      imageUrl: s.imageUrl,
      text: s.textContent,
      fetchedAt: s.fetchedAt,
      highlights: s.highlights.map(({ sourceId, ...h }) => (void sourceId, h)),
      summary: s.summary,
      notes: s.notes,
      lean: s.lean,
    },
  }
}

async function load(userId: string, id: string) {
  const source = await getSource(userId, id)
  if (!source) throw new ContentAccessError("Source not found", "not_found")
  return source
}

/** Research is the provider of `research.source`. */
export const researchSourceProvider: ContentProvider<"research.source"> = {
  kind: "research.source",
  versions: [1],
  actions: ["read", "annotate"],

  async collections({ userId }) {
    const list = await listCollections(userId, { createDefault: false })
    return list.map((c) => ({ id: c.id, name: c.name, description: c.description, itemCount: c.sourceCount, updatedAt: c.updatedAt }))
  },

  async list({ userId }, { collectionId, tag }) {
    if (!collectionId) throw new ContentAccessError("research.source items are listed per collection (collectionId)", "invalid")
    const sources = await listSources(userId, collectionId)
    return (tag ? sources.filter((s) => s.tags.includes(tag)) : sources).map(listItem)
  },

  async get({ userId }, id) {
    return item(await load(userId, id))
  },

  async annotate({ userId, extensionId }, id, input) {
    await load(userId, id)
    const body = (input ?? {}) as { summary?: unknown; notes?: unknown }
    if (body.summary === undefined && body.notes === undefined) {
      throw new ContentAccessError("Send summary and/or notes", "invalid")
    }
    const now = new Date().toISOString()
    const parsedSummary = body.summary === undefined ? null : parseSummaryInput(body.summary)
    const parsedNotes = body.notes === undefined ? null : parseNotesInput(body.notes)
    const summary: SourceSummary | null = parsedSummary && {
      text: parsedSummary.text,
      keyPoints: parsedSummary.keyPoints ?? [],
      model: parsedSummary.model,
      generatedAt: now,
      extensionId,
    }
    const notes: SourceNotes | null = parsedNotes && { body: parsedNotes.body, author: "extension", updatedAt: now, extensionId }
    if (summary) await setSourceEnrichment(userId, id, "summary", summary)
    if (notes) await setSourceEnrichment(userId, id, "notes", notes)
    return item(await load(userId, id))
  },
}
