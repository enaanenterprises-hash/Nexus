import "server-only";
import { randomUUID } from "node:crypto";
import { ensureCinemaSchema, getSql } from "@/lib/db/client";
import type {
  CinemaAspectRatio,
  CinemaAsset,
  CinemaBackground,
  CinemaClip,
  CinemaCollection,
  CinemaMarker,
  CinemaProject,
  CinemaProjectAnnotationV1,
  CinemaProjectSummary,
  CinemaTrack,
  CinemaTransition,
  SaveCinemaProjectInput,
} from "./types";

type Row = Record<string, unknown>;

export const DEFAULT_CINEMA_COLLECTION_NAME = "Cinema projects";
export const MAX_CINEMA_TAGS = 12;
const MAX_TRACKS = 24;
const MAX_CLIPS = 250;
const MAX_ASSETS = 150;
const MAX_MARKERS = 200;
const MAX_TRANSITIONS = 250;

const ASPECT_RATIOS: ReadonlySet<CinemaAspectRatio> = new Set([
  "16:9",
  "9:16",
  "1:1",
  "4:5",
  "21:9",
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

export function normalizeCinemaTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
    if (t) out.add(t);
  }
  return [...out].slice(0, MAX_CINEMA_TAGS);
}

function sanitizeBackground(raw: unknown): CinemaBackground {
  const b = (raw ?? {}) as Partial<CinemaBackground>;
  const type =
    b.type === "linear" || b.type === "radial" || b.type === "grid" ? b.type : "solid";
  return {
    type,
    colorA: typeof b.colorA === "string" && b.colorA.trim() ? b.colorA.trim().slice(0, 32) : "#0a0a0c",
    colorB: typeof b.colorB === "string" && b.colorB.trim() ? b.colorB.trim().slice(0, 32) : "#16161d",
    angleDeg: Math.round(clamp(Number(b.angleDeg ?? 135), 0, 360)),
    grain: Math.round(clamp(Number(b.grain ?? 0.02), 0, 0.12) * 1000) / 1000,
  };
}

function sanitizeTracks(raw: unknown): CinemaTrack[] {
  if (!Array.isArray(raw)) return [];
  const out: CinemaTrack[] = [];
  for (const item of raw.slice(0, MAX_TRACKS)) {
    const t = (item ?? {}) as Partial<CinemaTrack>;
    const id = typeof t.id === "string" && t.id.trim() ? t.id.trim().slice(0, 80) : randomUUID();
    const kind =
      t.kind === "overlay" || t.kind === "text" || t.kind === "audio" ? t.kind : "video";
    out.push({
      id,
      name:
        typeof t.name === "string" && t.name.trim()
          ? t.name.trim().slice(0, 60)
          : `Track ${out.length + 1}`,
      kind,
      muted: Boolean(t.muted),
      hidden: Boolean(t.hidden),
      locked: Boolean(t.locked),
      volume: Math.round(clamp(Number(t.volume ?? 1), 0, 2) * 100) / 100,
    });
  }
  return out;
}

function sanitizeClips(raw: unknown): CinemaClip[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_CLIPS).filter((c): c is CinemaClip => {
    if (!c || typeof c !== "object") return false;
    const obj = c as Partial<CinemaClip>;
    return typeof obj.id === "string" && typeof obj.trackId === "string" && typeof obj.kind === "string";
  });
}

function sanitizeTransitions(raw: unknown): CinemaTransition[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_TRANSITIONS).filter((t): t is CinemaTransition => {
    if (!t || typeof t !== "object") return false;
    const obj = t as Partial<CinemaTransition>;
    return typeof obj.id === "string" && typeof obj.afterClipId === "string" && typeof obj.type === "string";
  });
}

function sanitizeAssets(raw: unknown): CinemaAsset[] {
  if (!Array.isArray(raw)) return [];
  const out: CinemaAsset[] = [];
  for (const item of raw.slice(0, MAX_ASSETS)) {
    const a = (item ?? {}) as Partial<CinemaAsset>;
    if (typeof a.id !== "string" || !a.id.trim()) continue;
    const thumbnails = Array.isArray(a.thumbnails)
      ? a.thumbnails
          .filter((t): t is string => typeof t === "string" && t.length <= 28_000)
          .slice(0, 10)
      : [];
    const peaks = Array.isArray(a.peaks)
      ? a.peaks
          .map((n) => Math.round(clamp(Number(n) || 0, 0, 1) * 1000) / 1000)
          .slice(0, 240)
      : [];
    out.push({
      id: a.id.slice(0, 80),
      kind: a.kind === "image" || a.kind === "audio" ? a.kind : "video",
      name: typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 120) : "Media",
      idbKey: typeof a.idbKey === "string" ? a.idbKey.slice(0, 160) : "",
      url: typeof a.url === "string" && a.url.trim() ? a.url.trim().slice(0, 2000) : null,
      mimeType:
        typeof a.mimeType === "string" && a.mimeType.trim()
          ? a.mimeType.trim().slice(0, 120)
          : "application/octet-stream",
      byteLength: Math.max(0, Math.round(Number(a.byteLength) || 0)),
      durationMs: Math.max(0, Math.round(Number(a.durationMs) || 0)),
      width: Math.max(0, Math.round(Number(a.width) || 0)),
      height: Math.max(0, Math.round(Number(a.height) || 0)),
      thumbnails,
      peaks,
      source:
        a.source === "capture" ||
        a.source === "studio" ||
        a.source === "stock" ||
        a.source === "procedural"
          ? a.source
          : "upload",
      ...(a.studioRef ? { studioRef: a.studioRef } : {}),
      ...(a.attribution ? { attribution: a.attribution } : {}),
    });
  }
  return out;
}

function sanitizeMarkers(raw: unknown): CinemaMarker[] {
  if (!Array.isArray(raw)) return [];
  const out: CinemaMarker[] = [];
  for (const item of raw.slice(0, MAX_MARKERS)) {
    const m = (item ?? {}) as Partial<CinemaMarker>;
    const label = typeof m.label === "string" ? m.label.trim().slice(0, 120) : "";
    if (!label) continue;
    const kind =
      m.kind === "chapter" || m.kind === "cut" || m.kind === "studio" ? m.kind : "cue";
    out.push({
      id: typeof m.id === "string" && m.id.trim() ? m.id.trim().slice(0, 80) : randomUUID(),
      atMs: Math.max(0, Math.round(Number(m.atMs) || 0)),
      label,
      kind,
      note: typeof m.note === "string" && m.note.trim() ? m.note.trim().slice(0, 1000) : null,
      ...(typeof m.studioMarkerId === "string" && m.studioMarkerId
        ? { studioMarkerId: m.studioMarkerId.slice(0, 80) }
        : {}),
    });
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

async function db() {
  await ensureCinemaSchema();
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

function toCollection(row: Row): CinemaCollection {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    description: (row["description"] as string | null) ?? null,
    projectCount: Number(row["projectCount"] ?? 0),
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
  };
}

function toSummary(row: Row): CinemaProjectSummary {
  const tracks = parseJsonColumn<CinemaTrack[]>(row["tracks"], []);
  const clips = parseJsonColumn<CinemaClip[]>(row["clips"], []);
  const assets = parseJsonColumn<CinemaAsset[]>(row["assets"], []);
  const markers = parseJsonColumn<CinemaMarker[]>(row["markers"], []);
  const fpsRaw = Number(row["fps"] ?? 30);
  const fps: 24 | 30 | 60 = fpsRaw === 24 || fpsRaw === 60 ? fpsRaw : 30;
  const aspectRaw = String(row["aspectRatio"] ?? "16:9") as CinemaAspectRatio;
  return {
    id: String(row["id"]),
    collectionId: String(row["collectionId"]),
    title: String(row["title"]),
    description: (row["description"] as string | null) ?? null,
    aspectRatio: ASPECT_RATIOS.has(aspectRaw) ? aspectRaw : "16:9",
    fps,
    durationMs: Number(row["durationMs"] ?? 0),
    clipCount: clips.length,
    trackCount: tracks.length,
    markerCount: markers.length,
    thumbnailUrl: (row["thumbnailUrl"] as string | null) ?? null,
    hasLinkedStudioAudio:
      assets.some((a) => Boolean(a.studioRef)) ||
      clips.some((c) => c.kind === "audio" && Boolean(c.studioRef)),
    tags: (row["tags"] as string[] | null) ?? [],
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"] ?? row["createdAt"]),
  };
}

function toProject(row: Row): CinemaProject {
  const summary = toSummary(row);
  return {
    ...summary,
    width: Math.max(320, Math.round(Number(row["width"] ?? 1920))),
    height: Math.max(320, Math.round(Number(row["height"] ?? 1080))),
    background: sanitizeBackground(parseJsonColumn(row["background"], {})),
    tracks: parseJsonColumn<CinemaTrack[]>(row["tracks"], []),
    clips: parseJsonColumn<CinemaClip[]>(row["clips"], []),
    transitions: parseJsonColumn<CinemaTransition[]>(row["transitions"], []),
    assets: parseJsonColumn<CinemaAsset[]>(row["assets"], []),
    markers: parseJsonColumn<CinemaMarker[]>(row["markers"], []),
    notes: parseJsonColumn<CinemaProjectAnnotationV1 | null>(row["notes"], null),
  };
}

export async function listCinemaCollections(
  userId: string,
  options: { createDefault?: boolean } = {},
): Promise<CinemaCollection[]> {
  const sql = await db();
  const rows = await sql`
    SELECT c.*, (SELECT count(*) FROM "cinema_project" p WHERE p."collectionId" = c."id")::int AS "projectCount"
    FROM "cinema_collection" c
    WHERE c."userId" = ${userId}
    ORDER BY c."updatedAt" DESC`;
  if (rows.length === 0 && options.createDefault !== false) {
    const created = await createCinemaCollection(
      userId,
      DEFAULT_CINEMA_COLLECTION_NAME,
      "Timeline compositions and Creative Suite cuts",
    );
    return [created];
  }
  return rows.map(toCollection);
}

export async function createCinemaCollection(
  userId: string,
  name: string,
  description: string | null = null,
): Promise<CinemaCollection> {
  const sql = await db();
  const [row] = await sql`
    INSERT INTO "cinema_collection" ("id", "userId", "name", "description")
    VALUES (${randomUUID()}, ${userId}, ${name.slice(0, 80)}, ${description?.slice(0, 500) ?? null})
    RETURNING *, 0::int AS "projectCount"`;
  return toCollection(row!);
}

export async function listCinemaProjects(
  userId: string,
  collectionId?: string,
): Promise<CinemaProjectSummary[]> {
  const sql = await db();
  const rows = collectionId
    ? await sql`
        SELECT * FROM "cinema_project"
        WHERE "userId" = ${userId} AND "collectionId" = ${collectionId}
        ORDER BY "updatedAt" DESC`
    : await sql`
        SELECT * FROM "cinema_project"
        WHERE "userId" = ${userId}
        ORDER BY "updatedAt" DESC`;
  return rows.map(toSummary);
}

export async function getCinemaProject(userId: string, id: string): Promise<CinemaProject | null> {
  const sql = await db();
  const [row] = await sql`
    SELECT * FROM "cinema_project" WHERE "id" = ${id} AND "userId" = ${userId}`;
  return row ? toProject(row) : null;
}

export async function saveCinemaProject(
  userId: string,
  input: SaveCinemaProjectInput,
): Promise<CinemaProject | null> {
  const sql = await db();
  const [owned] = await sql`
    SELECT 1 FROM "cinema_collection" WHERE "id" = ${input.collectionId} AND "userId" = ${userId}`;
  if (!owned) return null;

  const aspectRatio: CinemaAspectRatio = ASPECT_RATIOS.has(input.aspectRatio)
    ? input.aspectRatio
    : "16:9";
  const fps: 24 | 30 | 60 = input.fps === 24 || input.fps === 60 ? input.fps : 30;
  const width = Math.round(clamp(Number(input.width) || 1920, 320, 3840)) & ~1;
  const height = Math.round(clamp(Number(input.height) || 1080, 320, 3840)) & ~1;
  const background = sanitizeBackground(input.background);
  const tracks = sanitizeTracks(input.tracks);
  const clips = sanitizeClips(input.clips);
  const transitions = sanitizeTransitions(input.transitions);
  const assets = sanitizeAssets(input.assets);
  const markers = sanitizeMarkers(input.markers);
  const tags = normalizeCinemaTags(input.tags);
  const maxEnd = clips.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
  const durationMs = Math.max(0, Math.round(Math.max(Number(input.durationMs) || 0, maxEnd)));
  const id = input.id?.trim() || randomUUID();
  const thumbnailUrl =
    typeof input.thumbnailUrl === "string" && input.thumbnailUrl.length <= 45_000
      ? input.thumbnailUrl
      : null;

  const [row] = await sql`
    INSERT INTO "cinema_project" (
      "id", "userId", "collectionId", "title", "description", "aspectRatio", "fps",
      "width", "height", "durationMs", "thumbnailUrl", "background", "tracks",
      "clips", "transitions", "assets", "markers", "tags"
    ) VALUES (
      ${id}, ${userId}, ${input.collectionId},
      ${input.title.trim().slice(0, 160) || "Untitled edit"},
      ${input.description?.trim().slice(0, 2000) ?? null},
      ${aspectRatio}, ${fps}, ${width}, ${height}, ${durationMs}, ${thumbnailUrl},
      ${JSON.stringify(background)}::jsonb,
      ${JSON.stringify(tracks)}::jsonb,
      ${JSON.stringify(clips)}::jsonb,
      ${JSON.stringify(transitions)}::jsonb,
      ${JSON.stringify(assets)}::jsonb,
      ${JSON.stringify(markers)}::jsonb,
      ${tags}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "collectionId" = EXCLUDED."collectionId",
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "aspectRatio" = EXCLUDED."aspectRatio",
      "fps" = EXCLUDED."fps",
      "width" = EXCLUDED."width",
      "height" = EXCLUDED."height",
      "durationMs" = EXCLUDED."durationMs",
      "thumbnailUrl" = EXCLUDED."thumbnailUrl",
      "background" = EXCLUDED."background",
      "tracks" = EXCLUDED."tracks",
      "clips" = EXCLUDED."clips",
      "transitions" = EXCLUDED."transitions",
      "assets" = EXCLUDED."assets",
      "markers" = EXCLUDED."markers",
      "tags" = EXCLUDED."tags",
      "updatedAt" = now()
    WHERE "cinema_project"."userId" = ${userId}
    RETURNING *`;

  if (!row) return null;
  await sql`UPDATE "cinema_collection" SET "updatedAt" = now() WHERE "id" = ${input.collectionId}`;
  return toProject(row);
}

export async function deleteCinemaProject(userId: string, id: string): Promise<boolean> {
  const sql = await db();
  const rows = await sql`
    DELETE FROM "cinema_project" WHERE "id" = ${id} AND "userId" = ${userId} RETURNING "id"`;
  return rows.length > 0;
}

export async function setCinemaProjectNotes(
  userId: string,
  id: string,
  notes: CinemaProjectAnnotationV1,
): Promise<CinemaProject | null> {
  const sql = await db();
  const [row] = await sql`
    UPDATE "cinema_project"
    SET "notes" = ${JSON.stringify(notes)}::jsonb, "updatedAt" = now()
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING *`;
  return row ? toProject(row) : null;
}
