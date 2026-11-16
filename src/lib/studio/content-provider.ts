import "server-only";
import { ContentAccessError, type ContentProvider } from "@/lib/content/provider";
import {
  getRecording,
  listCollections,
  listRecordings,
  setRecordingEnrichment,
} from "./store";
import type {
  StudioChaptersV1,
  StudioRecording,
  StudioRecordingContentV1,
  StudioRecordingListItemV1,
  StudioRecordingSummary,
  StudioSummaryV1,
  StudioTranscriptSegment,
  StudioTranscriptV1,
  WriteStudioChaptersInput,
  WriteStudioSummaryInput,
  WriteStudioTranscriptInput,
} from "./types";

const LIMITS = {
  transcript: 200_000,
  summary: 20_000,
  keyPoints: 25,
  chapters: 100,
  model: 100,
};

function parseTranscriptInput(value: unknown): WriteStudioTranscriptInput {
  const v = (value ?? {}) as Partial<WriteStudioTranscriptInput>;
  const text = typeof v.text === "string" ? v.text.trim() : "";
  const model = typeof v.model === "string" ? v.model.trim() : "";
  if (!text || text.length > LIMITS.transcript) {
    throw new ContentAccessError(`transcript.text must be 1-${LIMITS.transcript} characters`, "invalid");
  }
  if (!model || model.length > LIMITS.model) {
    throw new ContentAccessError(`transcript.model must be 1-${LIMITS.model} characters`, "invalid");
  }
  const segments: StudioTranscriptSegment[] = Array.isArray(v.segments)
    ? v.segments
        .filter((s) => s && typeof s.text === "string" && s.text.trim())
        .slice(0, 2000)
        .map((s) => ({
          startMs: Math.max(0, Math.round(Number(s.startMs) || 0)),
          endMs: Math.max(0, Math.round(Number(s.endMs) || 0)),
          speaker: typeof s.speaker === "string" && s.speaker.trim() ? s.speaker.trim().slice(0, 60) : null,
          text: s.text.trim().slice(0, 2000),
        }))
    : [];
  return {
    language: typeof v.language === "string" && v.language.trim() ? v.language.trim().slice(0, 24) : null,
    text,
    segments,
    model,
  };
}

function parseSummaryInput(value: unknown): WriteStudioSummaryInput {
  const v = (value ?? {}) as Partial<WriteStudioSummaryInput>;
  const text = typeof v.text === "string" ? v.text.trim() : "";
  const model = typeof v.model === "string" ? v.model.trim() : "";
  if (!text || text.length > LIMITS.summary) {
    throw new ContentAccessError(`summary.text must be 1-${LIMITS.summary} characters`, "invalid");
  }
  if (!model || model.length > LIMITS.model) {
    throw new ContentAccessError(`summary.model must be 1-${LIMITS.model} characters`, "invalid");
  }
  const cleanList = (arr: unknown) =>
    Array.isArray(arr)
      ? arr
          .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
          .slice(0, LIMITS.keyPoints)
          .map((x) => x.trim().slice(0, 500))
      : [];
  return {
    text,
    keyPoints: cleanList(v.keyPoints),
    actionItems: cleanList(v.actionItems),
    model,
  };
}

function parseChaptersInput(value: unknown): WriteStudioChaptersInput {
  const v = (value ?? {}) as Partial<WriteStudioChaptersInput>;
  const model = typeof v.model === "string" ? v.model.trim() : "";
  if (!model || model.length > LIMITS.model) {
    throw new ContentAccessError(`chapters.model must be 1-${LIMITS.model} characters`, "invalid");
  }
  if (!Array.isArray(v.items) || v.items.length > LIMITS.chapters) {
    throw new ContentAccessError(`chapters.items must be an array of up to ${LIMITS.chapters} entries`, "invalid");
  }
  const items = v.items
    .filter((c) => c && typeof c.title === "string" && c.title.trim())
    .map((c) => ({
      title: c.title.trim().slice(0, 120),
      startMs: Math.max(0, Math.round(Number(c.startMs) || 0)),
      endMs: Math.max(0, Math.round(Number(c.endMs) || 0)),
      summary: typeof c.summary === "string" && c.summary.trim() ? c.summary.trim().slice(0, 600) : null,
    }));
  return { items, model };
}

function toListEnvelope(r: StudioRecordingSummary): StudioRecordingListItemV1 {
  return {
    kind: "studio.recording",
    version: 1,
    id: r.id,
    title: r.title,
    collectionId: r.collectionId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    data: {
      description: r.description,
      bpm: r.bpm,
      durationMs: r.durationMs,
      trackCount: r.trackCount,
      markerCount: r.markerCount,
      peaks: r.peaks,
      tags: r.tags,
      hasTranscript: r.hasTranscript,
      hasSummary: r.hasSummary,
    },
  };
}

export function toRecordingEnvelope(r: StudioRecording): StudioRecordingContentV1 {
  return {
    kind: "studio.recording",
    version: 1,
    id: r.id,
    title: r.title,
    collectionId: r.collectionId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    data: {
      description: r.description,
      bpm: r.bpm,
      countInBars: r.countInBars,
      durationMs: r.durationMs,
      masterGain: r.masterGain,
      tracks: r.tracks,
      markers: r.markers,
      tags: r.tags,
      transcript: r.transcript,
      summary: r.summary,
      chapters: r.chapters,
    },
  };
}

/** Studio is the provider of `studio.recording`. */
export const studioRecordingProvider: ContentProvider<"studio.recording"> = {
  kind: "studio.recording",
  versions: [1],
  actions: ["read", "annotate"],

  async collections({ userId }) {
    const cols = await listCollections(userId, { createDefault: false });
    return cols.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      itemCount: c.recordingCount,
      updatedAt: c.updatedAt,
    }));
  },

  async list({ userId }, { collectionId, tag }) {
    const list = await listRecordings(userId, collectionId);
    return (tag ? list.filter((r) => r.tags.includes(tag)) : list).map(toListEnvelope);
  },

  async get({ userId }, id) {
    const rec = await getRecording(userId, id);
    if (!rec) throw new ContentAccessError("Recording not found", "not_found");
    return toRecordingEnvelope(rec);
  },

  async annotate({ userId, extensionId }, id, input) {
    const existing = await getRecording(userId, id);
    if (!existing) throw new ContentAccessError("Recording not found", "not_found");

    const body = (input ?? {}) as {
      transcript?: unknown;
      summary?: unknown;
      chapters?: unknown;
    };
    if (body.transcript === undefined && body.summary === undefined && body.chapters === undefined) {
      throw new ContentAccessError("Send transcript, summary, and/or chapters", "invalid");
    }

    const now = new Date().toISOString();
    if (body.transcript !== undefined) {
      const parsed = parseTranscriptInput(body.transcript);
      const val: StudioTranscriptV1 = {
        language: parsed.language ?? null,
        text: parsed.text,
        segments: parsed.segments ?? [],
        model: parsed.model,
        generatedAt: now,
        extensionId,
      };
      await setRecordingEnrichment(userId, id, "transcript", val);
    }
    if (body.summary !== undefined) {
      const parsed = parseSummaryInput(body.summary);
      const val: StudioSummaryV1 = {
        text: parsed.text,
        keyPoints: parsed.keyPoints ?? [],
        actionItems: parsed.actionItems ?? [],
        model: parsed.model,
        generatedAt: now,
        extensionId,
      };
      await setRecordingEnrichment(userId, id, "summary", val);
    }
    if (body.chapters !== undefined) {
      const parsed = parseChaptersInput(body.chapters);
      const val: StudioChaptersV1 = {
        items: parsed.items,
        model: parsed.model,
        generatedAt: now,
        extensionId,
      };
      await setRecordingEnrichment(userId, id, "chapters", val);
    }

    const updated = await getRecording(userId, id);
    return toRecordingEnvelope(updated!);
  },
};
