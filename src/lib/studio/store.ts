import "server-only";
import { randomUUID } from "node:crypto";
import { ensureStudioSchema, getSql } from "@/lib/db/client";
import type {
  SaveStudioRecordingInput,
  StudioAudioRef,
  StudioChaptersV1,
  StudioCollection,
  StudioMarkerKind,
  StudioMarkerV1,
  StudioRecording,
  StudioRecordingSummary,
  StudioSummaryV1,
  StudioTrackColor,
  StudioTrackRole,
  StudioTrackV1,
  StudioTranscriptV1,
} from "./types";

type Row = Record<string, unknown>;

export const DEFAULT_STUDIO_COLLECTION_NAME = "Studio sessions";
export const MAX_STUDIO_TAGS = 12;
const MAX_TRACKS = 64;
const MAX_MARKERS = 200;
const MAX_PEAKS = 512;

const TRACK_ROLES: ReadonlySet<StudioTrackRole> = new Set([
  "voice",
  "instrumental",
  "scratch",
  "overdub",
]);
const LEGACY_COLOR_MAP: Record<string, StudioTrackColor> = {
  blue: "blue",
  teal: "teal",
  indigo: "indigo",
  coral: "coral",
  slate: "slate",
  gold: "blue",
  sky: "teal",
  emerald: "indigo",
};
const MARKER_KINDS: ReadonlySet<StudioMarkerKind> = new Set([
  "cue",
  "chapter",
  "note",
  "edit",
]);

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const time = Date.parse(String(value));
  return Number.isNaN(time) ? String(value) : new Date(time).toISOString();
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function normalizeStudioTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
    if (t) out.add(t);
  }
  return [...out].slice(0, MAX_STUDIO_TAGS);
}

function sanitizePeaks(raw: unknown, maxCount = 240): number[] {
  if (!Array.isArray(raw)) return [];
  const count = Math.min(maxCount, MAX_PEAKS);
  const out: number[] = [];
  for (let i = 0; i < raw.length && out.length < count; i++) {
    const val = Number(raw[i]);
    if (Number.isFinite(val)) out.push(Math.round(clamp(val, 0, 1) * 1000) / 1000);
  }
  return out;
}

function sanitizeAudioRef(raw: unknown): StudioAudioRef {
  const obj = (raw ?? {}) as Partial<StudioAudioRef>;
  return {
    storage: obj.storage === "url" ? "url" : "idb",
    idbKey: typeof obj.idbKey === "string" ? obj.idbKey.slice(0, 160) : "",
    url: typeof obj.url === "string" && obj.url.trim() ? obj.url.trim().slice(0, 2000) : null,
    mimeType:
      typeof obj.mimeType === "string" && obj.mimeType.trim()
        ? obj.mimeType.trim().slice(0, 120)
        : "audio/webm",
    byteLength: Math.max(0, Math.round(Number(obj.byteLength) || 0)),
    sampleRate: Math.round(clamp(Number(obj.sampleRate) || 48000, 8000, 192000)),
  };
}

export function sanitizeTracks(raw: unknown): StudioTrackV1[] {
  if (!Array.isArray(raw)) return [];
  const out: StudioTrackV1[] = [];
  for (const item of raw.slice(0, MAX_TRACKS)) {
    const t = (item ?? {}) as Partial<StudioTrackV1>;
    const id = typeof t.id === "string" && t.id.trim() ? t.id.trim().slice(0, 80) : randomUUID();
    const role: StudioTrackRole = TRACK_ROLES.has(t.role as StudioTrackRole)
      ? (t.role as StudioTrackRole)
      : "voice";
    const durationMs = Math.max(0, Math.round(Number(t.durationMs) || 0));
    const trimStartMs =
      t.trimStartMs !== undefined ? Math.max(0, Math.round(Number(t.trimStartMs) || 0)) : undefined;
    const sourceDurationMs =
      t.sourceDurationMs !== undefined
        ? Math.max(durationMs + (trimStartMs ?? 0), Math.round(Number(t.sourceDurationMs) || 0))
        : undefined;
    const layerIndex =
      t.layerIndex !== undefined ? Math.round(clamp(Number(t.layerIndex) || 0, 0, 15)) : undefined;
    const fadeInMs =
      t.fadeInMs !== undefined ? Math.round(clamp(Number(t.fadeInMs) || 0, 0, Math.min(10_000, durationMs))) : undefined;
    const fadeOutMs =
      t.fadeOutMs !== undefined
        ? Math.round(clamp(Number(t.fadeOutMs) || 0, 0, Math.min(10_000, durationMs)))
        : undefined;
    const inputSource =
      typeof t.inputSource === "string" && t.inputSource.trim() ? t.inputSource.trim().slice(0, 80) : undefined;
    const colorTag =
      typeof t.colorTag === "string" && t.colorTag in LEGACY_COLOR_MAP
        ? LEGACY_COLOR_MAP[t.colorTag]
        : undefined;
    const eqLowDb =
      t.eqLowDb !== undefined ? Math.round(clamp(Number(t.eqLowDb) || 0, -6, 6) * 10) / 10 : undefined;
    const eqMidDb =
      t.eqMidDb !== undefined ? Math.round(clamp(Number(t.eqMidDb) || 0, -6, 6) * 10) / 10 : undefined;
    const eqHighDb =
      t.eqHighDb !== undefined ? Math.round(clamp(Number(t.eqHighDb) || 0, -6, 6) * 10) / 10 : undefined;
    out.push({
      id,
      name:
        typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, 80) : `Track ${out.length + 1}`,
      role,
      ...(layerIndex !== undefined ? { layerIndex } : {}),
      offsetMs: Math.max(0, Math.round(Number(t.offsetMs) || 0)),
      ...(trimStartMs !== undefined ? { trimStartMs } : {}),
      durationMs,
      ...(sourceDurationMs !== undefined ? { sourceDurationMs } : {}),
      ...(fadeInMs !== undefined && fadeInMs > 0 ? { fadeInMs } : {}),
      ...(fadeOutMs !== undefined && fadeOutMs > 0 ? { fadeOutMs } : {}),
      ...(inputSource ? { inputSource } : {}),
      ...(colorTag ? { colorTag } : {}),
      ...(t.hpfEnabled ? { hpfEnabled: true } : {}),
      ...(t.compressorEnabled ? { compressorEnabled: true } : {}),
      ...(eqLowDb !== undefined && eqLowDb !== 0 ? { eqLowDb } : {}),
      ...(eqMidDb !== undefined && eqMidDb !== 0 ? { eqMidDb } : {}),
      ...(eqHighDb !== undefined && eqHighDb !== 0 ? { eqHighDb } : {}),
      gain: Math.round(clamp(Number(t.gain ?? 1), 0, 2) * 100) / 100,
      pan: Math.round(clamp(Number(t.pan ?? 0), -1, 1) * 100) / 100,
      muted: Boolean(t.muted),
      solo: Boolean(t.solo),
      peaks: sanitizePeaks(t.peaks, 240),
      audioRef: sanitizeAudioRef(t.audioRef),
      createdAt: typeof t.createdAt === "string" && t.createdAt ? t.createdAt.slice(0, 40) : new Date().toISOString(),
    });
  }
  return out;
}

export function sanitizeMarkers(raw: unknown): StudioMarkerV1[] {
  if (!Array.isArray(raw)) return [];
  const out: StudioMarkerV1[] = [];
  for (const item of raw.slice(0, MAX_MARKERS)) {
    const m = (item ?? {}) as Partial<StudioMarkerV1>;
    const label = typeof m.label === "string" ? m.label.trim().slice(0, 120) : "";
    if (!label) continue;
    out.push({
      id: typeof m.id === "string" && m.id.trim() ? m.id.trim().slice(0, 80) : randomUUID(),
      atMs: Math.max(0, Math.round(Number(m.atMs) || 0)),
      label,
      kind: MARKER_KINDS.has(m.kind as StudioMarkerKind) ? (m.kind as StudioMarkerKind) : "cue",
      note: typeof m.note === "string" && m.note.trim() ? m.note.trim().slice(0, 2000) : null,
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

export function computeSummaryPeaks(tracks: StudioTrackV1[], length = 96): number[] {
  const active = tracks.filter((t) => !t.muted && t.peaks.length > 0);
  const pool = active.length > 0 ? active : tracks.filter((t) => t.peaks.length > 0);
  if (pool.length === 0) return [];
  const out = new Array<number>(length).fill(0);
  for (const t of pool) {
    for (let i = 0; i < length; i++) {
      const idx = Math.min(t.peaks.length - 1, Math.floor((i / length) * t.peaks.length));
      const v = clamp(t.peaks[idx]! * t.gain, 0, 1);
      if (v > out[i]!) out[i] = v;
    }
  }
  return out.map((v) => Math.round(v * 1000) / 1000);
}

async function db() {
  await ensureStudioSchema();
  return getSql();
}

function parseJsonColumn<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

function toCollection(row: Row): StudioCollection {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    description: (row["description"] as string | null) ?? null,
    recordingCount: Number(row["recordingCount"] ?? 0),
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
  };
}

function toSummary(row: Row): StudioRecordingSummary {
  const tracks = parseJsonColumn<StudioTrackV1[]>(row["tracks"], []);
  const markers = parseJsonColumn<StudioMarkerV1[]>(row["markers"], []);
  const peaks = parseJsonColumn<number[]>(row["peaks"], []);
  return {
    id: String(row["id"]),
    collectionId: String(row["collectionId"]),
    title: String(row["title"]),
    description: (row["description"] as string | null) ?? null,
    bpm: Number(row["bpm"] ?? 120),
    countInBars: Number(row["countInBars"] ?? 0),
    durationMs: Number(row["durationMs"] ?? 0),
    masterGain: Number(row["masterGain"] ?? 1),
    trackCount: tracks.length,
    markerCount: markers.length,
    peaks,
    tags: (row["tags"] as string[] | null) ?? [],
    hasTranscript: row["transcript"] !== null && row["transcript"] !== undefined,
    hasSummary: row["summary"] !== null && row["summary"] !== undefined,
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"] ?? row["createdAt"]),
  };
}

function toRecording(row: Row): StudioRecording {
  const summary = toSummary(row);
  return {
    ...summary,
    tracks: parseJsonColumn<StudioTrackV1[]>(row["tracks"], []),
    markers: parseJsonColumn<StudioMarkerV1[]>(row["markers"], []),
    transcript: parseJsonColumn<StudioTranscriptV1 | null>(row["transcript"], null),
    summary: parseJsonColumn<StudioSummaryV1 | null>(row["summary"], null),
    chapters: parseJsonColumn<StudioChaptersV1 | null>(row["chapters"], null),
  };
}

export async function listCollections(
  userId: string,
  options: { createDefault?: boolean } = {},
): Promise<StudioCollection[]> {
  const sql = await db();
  const rows = await sql`
    SELECT c.*, (SELECT count(*) FROM "studio_recording" r WHERE r."collectionId" = c."id")::int AS "recordingCount"
    FROM "studio_collection" c
    WHERE c."userId" = ${userId}
    ORDER BY c."updatedAt" DESC`;
  if (rows.length === 0 && options.createDefault !== false) {
    const created = await createCollection(userId, DEFAULT_STUDIO_COLLECTION_NAME, "Layered studio projects");
    return [created];
  }
  return rows.map(toCollection);
}

export async function createCollection(
  userId: string,
  name: string,
  description: string | null = null,
): Promise<StudioCollection> {
  const sql = await db();
  const [row] = await sql`
    INSERT INTO "studio_collection" ("id", "userId", "name", "description")
    VALUES (${randomUUID()}, ${userId}, ${name.slice(0, 80)}, ${description?.slice(0, 500) ?? null})
    RETURNING *, 0::int AS "recordingCount"`;
  return toCollection(row!);
}

export async function listRecordings(
  userId: string,
  collectionId?: string,
): Promise<StudioRecordingSummary[]> {
  const sql = await db();
  const rows = collectionId
    ? await sql`
        SELECT * FROM "studio_recording"
        WHERE "userId" = ${userId} AND "collectionId" = ${collectionId}
        ORDER BY "updatedAt" DESC`
    : await sql`
        SELECT * FROM "studio_recording"
        WHERE "userId" = ${userId}
        ORDER BY "updatedAt" DESC`;
  return rows.map(toSummary);
}

export async function getRecording(userId: string, id: string): Promise<StudioRecording | null> {
  const sql = await db();
  const [row] = await sql`
    SELECT * FROM "studio_recording" WHERE "id" = ${id} AND "userId" = ${userId}`;
  return row ? toRecording(row) : null;
}

export async function saveRecording(
  userId: string,
  input: SaveStudioRecordingInput,
): Promise<StudioRecording | null> {
  const sql = await db();
  const [owned] = await sql`
    SELECT 1 FROM "studio_collection" WHERE "id" = ${input.collectionId} AND "userId" = ${userId}`;
  if (!owned) return null;

  const tracks = sanitizeTracks(input.tracks);
  const markers = sanitizeMarkers(input.markers);
  const tags = normalizeStudioTags(input.tags);
  const peaks = computeSummaryPeaks(tracks, 96);
  const bpm = Math.round(clamp(Number(input.bpm ?? 120), 40, 240));
  const countInBars = Math.round(clamp(Number(input.countInBars ?? 0), 0, 4));
  const masterGain = Math.round(clamp(Number(input.masterGain ?? 1), 0, 2) * 100) / 100;
  const maxTrackEnd = tracks.reduce((max, t) => Math.max(max, t.offsetMs + t.durationMs), 0);
  const durationMs = Math.max(0, Math.round(Math.max(Number(input.durationMs) || 0, maxTrackEnd)));
  const id = input.id?.trim() || randomUUID();

  const [row] = await sql`
    INSERT INTO "studio_recording" (
      "id", "userId", "collectionId", "title", "description", "bpm", "countInBars",
      "durationMs", "masterGain", "peaks", "tracks", "markers", "tags"
    ) VALUES (
      ${id}, ${userId}, ${input.collectionId}, ${input.title.trim().slice(0, 160) || "Untitled take"},
      ${input.description?.trim().slice(0, 2000) ?? null}, ${bpm}, ${countInBars},
      ${durationMs}, ${masterGain}, ${JSON.stringify(peaks)}::jsonb,
      ${JSON.stringify(tracks)}::jsonb, ${JSON.stringify(markers)}::jsonb, ${tags}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "collectionId" = EXCLUDED."collectionId",
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "bpm" = EXCLUDED."bpm",
      "countInBars" = EXCLUDED."countInBars",
      "durationMs" = EXCLUDED."durationMs",
      "masterGain" = EXCLUDED."masterGain",
      "peaks" = EXCLUDED."peaks",
      "tracks" = EXCLUDED."tracks",
      "markers" = EXCLUDED."markers",
      "tags" = EXCLUDED."tags",
      "updatedAt" = now()
    WHERE "studio_recording"."userId" = ${userId}
    RETURNING *`;

  if (!row) return null;
  await sql`UPDATE "studio_collection" SET "updatedAt" = now() WHERE "id" = ${input.collectionId}`;
  return toRecording(row);
}

export async function deleteRecording(userId: string, id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    DELETE FROM "studio_recording" WHERE "id" = ${id} AND "userId" = ${userId} RETURNING "id"`;
  return rows.length > 0;
}

type StudioEnrichment = {
  transcript: StudioTranscriptV1;
  summary: StudioSummaryV1;
  chapters: StudioChaptersV1;
};

/** Write path for future AI transcription/summarization/chaptering or downstream nodes. */
export async function setRecordingEnrichment<K extends keyof StudioEnrichment>(
  userId: string,
  id: string,
  field: K,
  value: StudioEnrichment[K] | null,
) {
  const sql = await db();
  const payload = value === null ? null : JSON.stringify(value);
  if (field === "transcript") {
    await sql`UPDATE "studio_recording" SET "transcript" = ${payload}::jsonb, "updatedAt" = now() WHERE "id" = ${id} AND "userId" = ${userId}`;
  } else if (field === "summary") {
    await sql`UPDATE "studio_recording" SET "summary" = ${payload}::jsonb, "updatedAt" = now() WHERE "id" = ${id} AND "userId" = ${userId}`;
  } else {
    await sql`UPDATE "studio_recording" SET "chapters" = ${payload}::jsonb, "updatedAt" = now() WHERE "id" = ${id} AND "userId" = ${userId}`;
  }
}
