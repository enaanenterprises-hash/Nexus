"use client";

import { CINEMA_NODE_ID } from "@/extensions/cinema/node";
import { STUDIO_NODE_ID } from "@/extensions/studio/node";
import { nexusBus, type ExtensionId } from "@/lib/extensions";
import { loadAudioBlob } from "@/lib/studio/audio-db";
import type { StudioRecording, StudioTrackV1 } from "@/lib/studio/types";
import { computePeaksFromBuffer, encodeWavFromBuffer, mixTracksOffline } from "@/lib/studio/wav";
import {
  readLocalCinemaSnapshot,
  saveCinemaBlob,
  writeLocalCinemaSnapshot,
} from "./media-db";
import { buildTemplateProject, DEFAULT_TRANSFORM } from "./presets";
import type {
  CinemaAsset,
  CinemaAudioClip,
  CinemaCollection,
  CinemaExtractedAudioTransfer,
  CinemaMarker,
  CinemaProject,
  CinemaProjectContentV1,
  CinemaProjectSummary,
  CinemaTextClip,
  CinemaVoiceoverRequest,
  SaveCinemaProjectInput,
  StockMediaItem,
} from "./types";

export type CinemaBackendStatus = {
  databaseConfigured: boolean;
  pexelsConfigured: boolean;
};

function makeLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function summarizeLocal(p: CinemaProject): CinemaProjectSummary {
  return {
    id: p.id,
    collectionId: p.collectionId,
    title: p.title,
    description: p.description,
    aspectRatio: p.aspectRatio,
    fps: p.fps,
    durationMs: p.durationMs,
    clipCount: p.clips.length,
    trackCount: p.tracks.length,
    markerCount: p.markers.length,
    thumbnailUrl: p.thumbnailUrl,
    hasLinkedStudioAudio:
      p.assets.some((a) => Boolean(a.studioRef)) ||
      p.clips.some((c) => c.kind === "audio" && Boolean(c.studioRef)),
    tags: p.tags,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function fetchCinemaStatus(): Promise<CinemaBackendStatus> {
  try {
    const res = await fetch("/api/cinema/status", { cache: "no-store" });
    if (!res.ok) return { databaseConfigured: false, pexelsConfigured: false };
    const body = (await res.json()) as {
      database?: { configured?: boolean };
      pexels?: { configured?: boolean };
    };
    return {
      databaseConfigured: Boolean(body.database?.configured),
      pexelsConfigured: Boolean(body.pexels?.configured),
    };
  } catch {
    return { databaseConfigured: false, pexelsConfigured: false };
  }
}

export async function listCinemaCollections(useDatabase: boolean): Promise<CinemaCollection[]> {
  if (useDatabase) {
    const res = await fetch("/api/cinema/collections", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { collections: CinemaCollection[] };
      return body.collections;
    }
  }

  const snap = readLocalCinemaSnapshot();
  if (snap.collections.length === 0) {
    const now = new Date().toISOString();
    const initial: CinemaCollection = {
      id: "local-cinema-projects",
      name: "Cinema projects",
      description: "Video timelines wired to Recording Studio",
      projectCount: snap.projects.length,
      createdAt: now,
      updatedAt: now,
    };
    snap.collections = [initial];
    if (snap.projects.length === 0) {
      snap.projects = [buildTemplateProject("editorial-sequence", initial.id)];
    }
    writeLocalCinemaSnapshot(snap);
  }
  return snap.collections.map((c) => ({
    ...c,
    projectCount: snap.projects.filter((p) => p.collectionId === c.id).length,
  }));
}

export async function createCinemaCollection(
  useDatabase: boolean,
  name: string,
  description?: string | null,
): Promise<CinemaCollection> {
  if (useDatabase) {
    const res = await fetch("/api/cinema/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description ?? null }),
    });
    if (res.ok) {
      const body = (await res.json()) as { collection: CinemaCollection };
      return body.collection;
    }
  }

  const snap = readLocalCinemaSnapshot();
  const now = new Date().toISOString();
  const created: CinemaCollection = {
    id: makeLocalId("col"),
    name: name.trim().slice(0, 80),
    description: description?.trim() || null,
    projectCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  snap.collections = [created, ...snap.collections];
  writeLocalCinemaSnapshot(snap);
  return created;
}

export async function listCinemaProjects(
  useDatabase: boolean,
  collectionId?: string,
): Promise<CinemaProjectSummary[]> {
  if (useDatabase) {
    const qs = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : "";
    const res = await fetch(`/api/cinema/projects${qs}`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { projects: CinemaProjectSummary[] };
      return body.projects;
    }
  }

  const snap = readLocalCinemaSnapshot();
  const list = collectionId
    ? snap.projects.filter((p) => p.collectionId === collectionId)
    : snap.projects;
  return list
    .map(summarizeLocal)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getCinemaProject(
  useDatabase: boolean,
  id: string,
): Promise<CinemaProject | null> {
  if (useDatabase) {
    const res = await fetch(`/api/cinema/projects/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { project: CinemaProject };
      return body.project;
    }
  }
  const snap = readLocalCinemaSnapshot();
  return snap.projects.find((p) => p.id === id) ?? null;
}

export async function saveCinemaProject(
  useDatabase: boolean,
  input: SaveCinemaProjectInput,
): Promise<CinemaProject> {
  let saved: CinemaProject | null = null;
  if (useDatabase) {
    const res = await fetch("/api/cinema/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const body = (await res.json()) as { project: CinemaProject };
      saved = body.project;
    }
  }

  if (!saved) {
    const snap = readLocalCinemaSnapshot();
    const now = new Date().toISOString();
    const existing = input.id ? snap.projects.find((p) => p.id === input.id) : undefined;
    const maxEnd = input.clips.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
    saved = {
      id: existing?.id ?? input.id ?? makeLocalId("cin"),
      collectionId: input.collectionId,
      title: input.title.trim().slice(0, 160) || "Untitled edit",
      description: input.description?.trim() || null,
      aspectRatio: input.aspectRatio,
      fps: input.fps,
      width: input.width,
      height: input.height,
      durationMs: Math.max(input.durationMs, maxEnd),
      clipCount: input.clips.length,
      trackCount: input.tracks.length,
      markerCount: input.markers.length,
      thumbnailUrl: input.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
      hasLinkedStudioAudio:
        input.assets.some((a) => Boolean(a.studioRef)) ||
        input.clips.some((c) => c.kind === "audio" && Boolean(c.studioRef)),
      tags: input.tags ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      background: input.background,
      tracks: input.tracks,
      clips: input.clips,
      transitions: input.transitions,
      assets: input.assets,
      markers: input.markers,
      notes: existing?.notes ?? null,
    };
    snap.projects = [saved, ...snap.projects.filter((p) => p.id !== saved!.id)];
    writeLocalCinemaSnapshot(snap);
  }

  nexusBus.emit(
    "cinema:project-saved",
    {
      projectId: saved.id,
      collectionId: saved.collectionId,
      title: saved.title,
      durationMs: saved.durationMs,
      clipCount: saved.clips.length,
    },
    CINEMA_NODE_ID,
  );

  return saved;
}

export async function deleteCinemaProject(useDatabase: boolean, id: string): Promise<boolean> {
  if (useDatabase) {
    const res = await fetch(`/api/cinema/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) return true;
  }
  const snap = readLocalCinemaSnapshot();
  const next = snap.projects.filter((p) => p.id !== id);
  writeLocalCinemaSnapshot({ ...snap, projects: next });
  return next.length !== snap.projects.length;
}

export async function searchStockMedia(
  query: string,
  type: "videos" | "photos",
  page = 1,
): Promise<{ configured: boolean; items: StockMediaItem[]; hasMore: boolean }> {
  const qs = new URLSearchParams({
    type,
    query: query.trim(),
    page: String(page),
  });
  const res = await fetch(`/api/cinema/stock?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Stock search failed.");
  }
  return (await res.json()) as { configured: boolean; items: StockMediaItem[]; hasMore: boolean };
}

export function buildCinemaProjectEnvelope(p: CinemaProject): CinemaProjectContentV1 {
  return {
    kind: "cinema.project",
    version: 1,
    id: p.id,
    title: p.title,
    collectionId: p.collectionId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    data: {
      description: p.description,
      aspectRatio: p.aspectRatio,
      fps: p.fps,
      width: p.width,
      height: p.height,
      durationMs: p.durationMs,
      background: p.background,
      tracks: p.tracks,
      clips: p.clips,
      transitions: p.transitions,
      markers: p.markers,
      tags: p.tags,
      notes: p.notes,
    },
  };
}

export function emitCinemaVoiceoverRequested(request: CinemaVoiceoverRequest): void {
  nexusBus.emit("cinema:voiceover-requested", request, CINEMA_NODE_ID);
}

export function emitCinemaAudioExtracted(transfer: CinemaExtractedAudioTransfer): void {
  nexusBus.emit("cinema:audio-extracted", transfer, CINEMA_NODE_ID);
}

export function emitCinemaProjectRouted(
  project: CinemaProject,
  targetNodeId: ExtensionId = STUDIO_NODE_ID,
): void {
  nexusBus.emit(
    "cinema:project-routed",
    {
      projectId: project.id,
      targetNodeId,
      title: project.title,
      envelope: buildCinemaProjectEnvelope(project),
    },
    CINEMA_NODE_ID,
  );
}

async function resolveStudioTrackBlob(track: StudioTrackV1): Promise<Blob | null> {
  if (track.audioRef.idbKey) {
    const local = await loadAudioBlob(track.audioRef.idbKey);
    if (local) return local;
  }
  if (track.audioRef.url) {
    try {
      const res = await fetch(track.audioRef.url);
      if (res.ok) return await res.blob();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Converts a live Recording Studio session (from IDB blobs or Supabase URLs) into
 * Cinema audio assets + clips + synchronized chapter markers + optional captions.
 */
export async function importStudioRecordingIntoCinema(
  recording: StudioRecording,
  mode: "mix" | "stems",
  insertAtMs: number,
  audioTrackId: string,
  textTrackId?: string,
): Promise<{
  assets: CinemaAsset[];
  clips: CinemaAudioClip[];
  markers: CinemaMarker[];
  captionClips: CinemaTextClip[];
}> {
  const markers: CinemaMarker[] = recording.markers.map((m) => ({
    id: makeLocalId("mrk"),
    atMs: Math.max(0, insertAtMs + m.atMs),
    label: m.label,
    kind: "studio",
    note: m.note,
    studioMarkerId: m.id,
  }));

  const captionClips: CinemaTextClip[] =
    textTrackId && recording.transcript?.segments.length
      ? recording.transcript.segments.slice(0, 60).map((seg, i) => {
          const start = Math.max(0, insertAtMs + seg.startMs);
          const dur = Math.max(800, seg.endMs - seg.startMs);
          return {
            id: makeLocalId("txt"),
            trackId: textTrackId,
            name: `Caption ${i + 1}`,
            kind: "text",
            startMs: start,
            durationMs: dur,
            trimStartMs: 0,
            sourceDurationMs: dur,
            speed: 1,
            locked: false,
            hidden: false,
            text: seg.text,
            fontFamily: "Manrope, -apple-system, 'SF Pro Display', sans-serif",
            fontSize: 38,
            fontWeight: 600,
            letterSpacing: -0.015,
            lineHeight: 1.24,
            align: "center",
            color: "#09090b",
            backgroundColor: "#f5f5f7",
            backgroundPadding: 16,
            backgroundRadius: 12,
            strokeColor: "transparent",
            strokeWidth: 0,
            textPreset: "kinetic-caption",
            transform: { ...DEFAULT_TRANSFORM, x: 50, y: 84, width: 72, height: 12 },
            animation: { inType: "fade", inDurationMs: 140, outType: "fade", outDurationMs: 140 },
          };
        })
      : [];

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = AudioCtx ? new AudioCtx() : null;
  const decodedItems: Array<{ track: StudioTrackV1; blob: Blob; buffer: AudioBuffer }> = [];

  try {
    for (const track of recording.tracks) {
      const blob = await resolveStudioTrackBlob(track);
      if (!blob) continue;
      if (ctx) {
        try {
          const arr = await blob.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arr);
          decodedItems.push({ track, blob, buffer });
        } catch {
          // Skip corrupt audio decode
        }
      }
    }
  } finally {
    if (ctx) void ctx.close();
  }

  const assets: CinemaAsset[] = [];
  const clips: CinemaAudioClip[] = [];

  if (mode === "mix" && decodedItems.length > 0) {
    const rendered = await mixTracksOffline(
      decodedItems.map((d) => ({ track: d.track, buffer: d.buffer })),
      recording.masterGain ?? 1,
      48_000,
    );
    const wavBlob = encodeWavFromBuffer(rendered);
    const peaks = computePeaksFromBuffer(rendered, 180);
    const durationMs = Math.max(500, Math.round(rendered.duration * 1000));
    const assetId = makeLocalId("ast");
    const idbKey = `cin-studio-mix-${assetId}`;
    await saveCinemaBlob(idbKey, wavBlob);

    const studioRef = {
      recordingId: recording.id,
      updatedAt: recording.updatedAt,
      title: recording.title,
    };

    assets.push({
      id: assetId,
      kind: "audio",
      name: `${recording.title} (Studio Mix)`,
      idbKey,
      url: null,
      mimeType: "audio/wav",
      byteLength: wavBlob.size,
      durationMs,
      width: 0,
      height: 0,
      thumbnails: [],
      peaks,
      source: "studio",
      studioRef,
    });

    clips.push({
      id: makeLocalId("aud"),
      trackId: audioTrackId,
      name: `${recording.title} · Mix`,
      kind: "audio",
      assetId,
      startMs: Math.max(0, insertAtMs),
      durationMs,
      trimStartMs: 0,
      sourceDurationMs: durationMs,
      speed: 1,
      locked: false,
      hidden: false,
      volume: 1,
      muted: false,
      fadeInMs: 0,
      fadeOutMs: 0,
      peaks,
      studioRef,
    });

    return { assets, clips, markers, captionClips };
  }

  // Stem mode (or fallback when blobs live offline on another device)
  const sourceTracks = recording.tracks;
  for (const track of sourceTracks) {
    const match = decodedItems.find((d) => d.track.id === track.id);
    const assetId = makeLocalId("ast");
    const idbKey = `cin-studio-stem-${assetId}`;
    let mimeType = track.audioRef.mimeType || "audio/wav";
    let byteLength = track.audioRef.byteLength;
    const peaks = track.peaks.length > 0 ? track.peaks : match ? computePeaksFromBuffer(match.buffer, 140) : [];

    if (match) {
      await saveCinemaBlob(idbKey, match.blob);
      byteLength = match.blob.size;
      mimeType = match.blob.type || mimeType;
    }

    const studioRef = {
      recordingId: recording.id,
      trackId: track.id,
      updatedAt: recording.updatedAt,
      title: recording.title,
      colorTag: track.colorTag,
    };

    const sourceDurationMs = track.sourceDurationMs ?? (track.trimStartMs ?? 0) + track.durationMs;
    assets.push({
      id: assetId,
      kind: "audio",
      name: `${recording.title} · ${track.name}`,
      idbKey: match ? idbKey : "",
      url: track.audioRef.url,
      mimeType,
      byteLength,
      durationMs: Math.max(250, sourceDurationMs),
      width: 0,
      height: 0,
      thumbnails: [],
      peaks,
      source: "studio",
      studioRef,
    });

    clips.push({
      id: makeLocalId("aud"),
      trackId: audioTrackId,
      name: track.name,
      kind: "audio",
      assetId,
      startMs: Math.max(0, insertAtMs + track.offsetMs),
      durationMs: Math.max(250, track.durationMs),
      trimStartMs: track.trimStartMs ?? 0,
      sourceDurationMs: Math.max(250, sourceDurationMs),
      speed: 1,
      locked: false,
      hidden: track.muted,
      volume: track.gain,
      muted: track.muted,
      fadeInMs: track.fadeInMs ?? 0,
      fadeOutMs: track.fadeOutMs ?? 0,
      peaks,
      studioRef,
    });
  }

  return { assets, clips, markers, captionClips };
}
