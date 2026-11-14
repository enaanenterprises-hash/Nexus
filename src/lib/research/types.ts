/**
 * Research node data model, shared by the server routes and the browser UI.
 * Everything here is plain JSON so it can cross the route boundary as-is.
 */

/** A page run through the reader: clean, sanitized article plus metadata. */
export interface ReaderDocument {
  /** URL that was requested (after normalisation). */
  requestedUrl: string;
  /** URL the content actually came from, after redirects. */
  url: string;
  /** `<link rel="canonical">` / `og:url` when the page declares one. */
  canonicalUrl: string | null;
  title: string;
  siteName: string | null;
  author: string | null;
  /** ISO string when it could be parsed, otherwise the raw value the page declared. */
  publishedAt: string | null;
  excerpt: string | null;
  lang: string | null;
  imageUrl: string | null;
  /** Sanitized HTML, safe to render with `dangerouslySetInnerHTML`. */
  contentHtml: string;
  /** Plain text of the article, for search, highlights and future AI readers. */
  textContent: string;
  wordCount: number;
  /** True only when the site's headers allow framing by another origin. */
  embeddable: boolean;
  fetchedAt: string;
}

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  siteName: string | null;
  /** Human-readable age as returned by the provider ("2 days ago"). */
  age: string | null;
  thumbnailUrl: string | null;
}

export type SearchResponse =
  | { ok: true; provider: string; query: string; results: SearchResult[] }
  | { ok: false; provider: string | null; query: string; reason: "not_configured" | "failed"; message: string };

export interface ResearchCollection {
  id: string;
  name: string;
  description: string | null;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Extension point: written by a future AI summarizer. Null until one runs.
 * `model` records which provider produced it so stale summaries can be redone.
 */
export interface SourceSummary {
  text: string;
  keyPoints: string[];
  model: string;
  generatedAt: string;
  /** Set when an extension wrote it through the research API. */
  extensionId?: string;
}

/** Extension point: notes / drafted documents attached to a source. */
export interface SourceNotes {
  body: string;
  author: "user" | "nexus" | "extension";
  updatedAt: string;
  extensionId?: string;
}

export type PoliticalLeanLabel = "left" | "lean-left" | "center" | "lean-right" | "right" | "mixed" | "unknown";

/** Extension point: political lean / bias assessment of a source. */
export interface SourceLean {
  label: PoliticalLeanLabel;
  /** 0..1 */
  confidence: number;
  rationale: string;
  /** e.g. "model:<name>" or "rating:<organisation>". */
  method: string;
  assessedAt: string;
}

/** W3C text-quote style anchor, so highlights survive re-rendering. */
export interface SourceHighlight {
  id: string;
  sourceId: string;
  quote: string;
  prefix: string;
  suffix: string;
  note: string | null;
  createdAt: string;
}

/** Light listing row; omits the article body. */
export interface ResearchSourceSummary {
  id: string;
  collectionId: string;
  url: string;
  canonicalUrl: string | null;
  title: string;
  siteName: string | null;
  author: string | null;
  publishedAt: string | null;
  excerpt: string | null;
  tags: string[];
  wordCount: number;
  highlightCount: number;
  savedAt: string;
  updatedAt: string;
}

/** A saved page with everything needed to read it again without refetching. */
export interface ResearchSource extends ResearchSourceSummary {
  lang: string | null;
  imageUrl: string | null;
  contentHtml: string;
  textContent: string;
  fetchedAt: string;
  highlights: SourceHighlight[];
  summary: SourceSummary | null;
  notes: SourceNotes | null;
  lean: SourceLean | null;
}

export type ApiError = { error: string; code?: string };

/* ——— Shared content kind `research.source`, version 1 (see docs/extensions.md) ——— */

/** Listing payload: metadata only. */
export interface ResearchSourceListDataV1 {
  url: string;
  canonicalUrl: string | null;
  siteName: string | null;
  author: string | null;
  publishedAt: string | null;
  excerpt: string | null;
  tags: string[];
  wordCount: number;
  highlightCount: number;
}

/** Full payload: plain text, highlights and annotations. Sanitized HTML stays inside Research. */
export interface ResearchSourceDataV1 extends Omit<ResearchSourceListDataV1, "highlightCount"> {
  lang: string | null;
  imageUrl: string | null;
  text: string;
  fetchedAt: string;
  highlights: Array<Omit<SourceHighlight, "sourceId">>;
  summary: SourceSummary | null;
  notes: SourceNotes | null;
  lean: SourceLean | null;
}

type Envelope<D> = {
  kind: "research.source";
  version: 1;
  id: string;
  title: string;
  collectionId: string | null;
  createdAt: string;
  updatedAt: string;
  data: D;
};

export type ResearchSourceListItemV1 = Envelope<ResearchSourceListDataV1>;
export type ResearchSourceContentV1 = Envelope<ResearchSourceDataV1>;

export interface WriteSummaryInput {
  text: string;
  keyPoints?: string[];
  /** Which model or method produced it, e.g. "gpt-x" or "manual". */
  model: string;
}

export interface WriteNotesInput {
  body: string;
}

/** What `annotate` may write on a source; `lean` stays analyzer-only. */
export interface ResearchSourceAnnotationV1 {
  summary?: WriteSummaryInput;
  notes?: WriteNotesInput;
}

export type ResearchStatus = {
  search: { configured: boolean; provider: string | null };
  library: { configured: boolean };
};
