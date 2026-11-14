import "server-only"
import { getSource, setSourceEnrichment } from "./store"
import type { ResearchSource, SourceLean, SourceNotes, SourceSummary } from "./types"

/**
 * Server-side hook for future AI over saved sources. An analyzer reads the
 * stored article (no refetch) and returns one enrichment, which is written to
 * the matching column. None are registered yet, so saving does no AI work.
 */
export type SourceAnalyzer =
  | { id: string; produces: "summary"; analyze: (source: ResearchSource) => Promise<SourceSummary | null> }
  | { id: string; produces: "notes"; analyze: (source: ResearchSource) => Promise<SourceNotes | null> }
  | { id: string; produces: "lean"; analyze: (source: ResearchSource) => Promise<SourceLean | null> }

const analyzers: SourceAnalyzer[] = []

export function registerSourceAnalyzer(analyzer: SourceAnalyzer): () => void {
  analyzers.push(analyzer)
  return () => {
    const index = analyzers.indexOf(analyzer)
    if (index >= 0) analyzers.splice(index, 1)
  }
}

/** Runs after a source is saved (via `after()`), so it never delays the response. */
export async function runSourceAnalyzers(userId: string, sourceId: string): Promise<void> {
  if (analyzers.length === 0) return
  const source = await getSource(userId, sourceId)
  if (!source) return
  for (const analyzer of analyzers) {
    try {
      const value = await analyzer.analyze(source)
      if (value) await setSourceEnrichment(userId, sourceId, analyzer.produces, value as never)
    } catch (error) {
      console.error(`[research] analyzer ${analyzer.id} failed`, error)
    }
  }
}
