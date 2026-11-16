import "server-only";
import { getRecording, setRecordingEnrichment } from "./store";
import type {
  StudioChaptersV1,
  StudioRecording,
  StudioSummaryV1,
  StudioTranscriptV1,
} from "./types";

/**
 * Server-side hook for future AI over saved studio recordings (transcription,
 * summaries, chapter extraction, study cards). No analyzers are registered yet.
 */
export type StudioAnalyzer =
  | { id: string; produces: "transcript"; analyze: (rec: StudioRecording) => Promise<StudioTranscriptV1 | null> }
  | { id: string; produces: "summary"; analyze: (rec: StudioRecording) => Promise<StudioSummaryV1 | null> }
  | { id: string; produces: "chapters"; analyze: (rec: StudioRecording) => Promise<StudioChaptersV1 | null> };

const analyzers: StudioAnalyzer[] = [];

export function registerStudioAnalyzer(analyzer: StudioAnalyzer): () => void {
  analyzers.push(analyzer);
  return () => {
    const idx = analyzers.indexOf(analyzer);
    if (idx >= 0) analyzers.splice(idx, 1);
  };
}

/** Runs after a recording is saved (via `after()`), never delaying user save. */
export async function runStudioAnalyzers(userId: string, recordingId: string): Promise<void> {
  if (analyzers.length === 0) return;
  const recording = await getRecording(userId, recordingId);
  if (!recording) return;
  for (const analyzer of analyzers) {
    try {
      const value = await analyzer.analyze(recording);
      if (value) await setRecordingEnrichment(userId, recordingId, analyzer.produces, value as never);
    } catch (error) {
      console.error(`[studio] analyzer ${analyzer.id} failed`, error);
    }
  }
}
