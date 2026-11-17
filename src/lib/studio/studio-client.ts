"use client";

import { STUDIO_NODE_ID } from "@/extensions/studio/node";
import { nexusBus, type ExtensionId } from "@/lib/extensions";
import {
  loadAudioBlob,
  readLocalStudioSnapshot,
  writeLocalStudioSnapshot,
} from "./audio-db";
import type {
  SaveStudioRecordingInput,
  StudioCollection,
  StudioRecording,
  StudioRecordingContentV1,
  StudioRecordingSummary,
  StudioRoutingIntent,
  StudioTrackV1,
} from "./types";

export type StudioBackendStatus = {
  databaseConfigured: boolean;
  storageConfigured: boolean;
};

function makeLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeLocal(r: StudioRecording): StudioRecordingSummary {
  return {
    id: r.id,
    collectionId: r.collectionId,
    title: r.title,
    description: r.description,
    bpm: r.bpm,
    countInBars: r.countInBars,
    durationMs: r.durationMs,
    masterGain: r.masterGain,
    trackCount: r.tracks.length,
    markerCount: r.markers.length,
    peaks: r.peaks,
    tags: r.tags,
    hasTranscript: Boolean(r.transcript),
    hasSummary: Boolean(r.summary),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function computeLocalPeaks(tracks: StudioRecording["tracks"]): number[] {
  const pool = tracks.filter((t) => !t.muted && t.peaks.length > 0);
  const src = pool.length > 0 ? pool : tracks.filter((t) => t.peaks.length > 0);
  if (src.length === 0) return [];
  const len = 96;
  const out = new Array<number>(len).fill(0);
  for (const t of src) {
    for (let i = 0; i < len; i++) {
      const idx = Math.min(t.peaks.length - 1, Math.floor((i / len) * t.peaks.length));
      out[i] = Math.max(out[i]!, Math.min(1, t.peaks[idx]! * t.gain));
    }
  }
  return out;
}

export async function fetchStudioStatus(): Promise<StudioBackendStatus> {
  try {
    const res = await fetch("/api/studio/status", { cache: "no-store" });
    if (!res.ok) return { databaseConfigured: false, storageConfigured: false };
    const body = (await res.json()) as {
      database?: { configured?: boolean };
      storage?: { configured?: boolean };
    };
    return {
      databaseConfigured: Boolean(body.database?.configured),
      storageConfigured: Boolean(body.storage?.configured),
    };
  } catch {
    return { databaseConfigured: false, storageConfigured: false };
  }
}

async function uploadStudioAudioBlob(key: string, blob: Blob): Promise<string | null> {
  if (!key) return null;
  try {
    const signRes = await fetch("/api/studio/audio/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    if (signRes.ok) {
      const signData = (await signRes.json()) as {
        configured?: boolean;
        signedUrl?: string;
        objectUrl?: string;
      };
      if (!signData.configured) return null;
      if (signData.signedUrl && signData.objectUrl) {
        try {
          const putRes = await fetch(signData.signedUrl, {
            method: "PUT",
            headers: { "content-type": blob.type || "audio/webm" },
            body: blob,
          });
          if (putRes.ok) return signData.objectUrl;
        } catch {
          // Fall through to same-origin server upload fallback if direct PUT fails
        }
      }
    }
  } catch {
    // Fall through to multipart fallback
  }

  try {
    const form = new FormData();
    form.set("key", key);
    form.set("file", blob, key);
    const uploadRes = await fetch(`/api/studio/audio?key=${encodeURIComponent(key)}`, {
      method: "POST",
      body: form,
    });
    if (!uploadRes.ok) return null;
    const data = (await uploadRes.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

async function syncTracksToCloudStorage(tracks: StudioTrackV1[]): Promise<StudioTrackV1[]> {
  const uniqueKeys = new Set<string>();
  for (const t of tracks) {
    if (t.audioRef.idbKey && (t.audioRef.storage !== "url" || !t.audioRef.url)) {
      uniqueKeys.add(t.audioRef.idbKey);
    }
  }
  if (uniqueKeys.size === 0) return tracks;

  const uploadedUrls = new Map<string, string>();
  await Promise.all(
    [...uniqueKeys].map(async (key) => {
      const blob = await loadAudioBlob(key);
      if (!blob) return;
      const url = await uploadStudioAudioBlob(key, blob);
      if (url) uploadedUrls.set(key, url);
    }),
  );
  if (uploadedUrls.size === 0) return tracks;

  return tracks.map((t) => {
    const cloudUrl = uploadedUrls.get(t.audioRef.idbKey);
    if (!cloudUrl) return t;
    return {
      ...t,
      audioRef: {
        ...t.audioRef,
        storage: "url",
        url: cloudUrl,
      },
    };
  });
}

export async function listStudioCollections(useDatabase: boolean): Promise<StudioCollection[]> {
  if (useDatabase) {
    const res = await fetch("/api/studio/collections", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { collections: StudioCollection[] };
      return body.collections;
    }
  }

  const snap = readLocalStudioSnapshot();
  if (snap.collections.length === 0) {
    const now = new Date().toISOString();
    const initial: StudioCollection = {
      id: "local-studio-sessions",
      name: "Studio sessions",
      description: "Layered local recordings ready to route into Nexus nodes",
      recordingCount: snap.recordings.length,
      createdAt: now,
      updatedAt: now,
    };
    snap.collections = [initial];
    writeLocalStudioSnapshot(snap);
  }
  return snap.collections.map((c) => ({
    ...c,
    recordingCount: snap.recordings.filter((r) => r.collectionId === c.id).length,
  }));
}

export async function createStudioCollection(
  useDatabase: boolean,
  name: string,
  description?: string | null,
): Promise<StudioCollection> {
  if (useDatabase) {
    const res = await fetch("/api/studio/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description ?? null }),
    });
    if (res.ok) {
      const body = (await res.json()) as { collection: StudioCollection };
      return body.collection;
    }
  }

  const snap = readLocalStudioSnapshot();
  const now = new Date().toISOString();
  const created: StudioCollection = {
    id: makeLocalId("col"),
    name: name.trim().slice(0, 80),
    description: description?.trim() || null,
    recordingCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  snap.collections = [created, ...snap.collections];
  writeLocalStudioSnapshot(snap);
  return created;
}

export async function listStudioRecordings(
  useDatabase: boolean,
  collectionId?: string,
): Promise<StudioRecordingSummary[]> {
  if (useDatabase) {
    const qs = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : "";
    const res = await fetch(`/api/studio/recordings${qs}`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { recordings: StudioRecordingSummary[] };
      return body.recordings;
    }
  }

  const snap = readLocalStudioSnapshot();
  const list = collectionId
    ? snap.recordings.filter((r) => r.collectionId === collectionId)
    : snap.recordings;
  return list
    .map(summarizeLocal)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export async function getStudioRecording(
  useDatabase: boolean,
  id: string,
): Promise<StudioRecording | null> {
  if (useDatabase) {
    const res = await fetch(`/api/studio/recordings/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const body = (await res.json()) as { recording: StudioRecording };
      return body.recording;
    }
  }
  const snap = readLocalStudioSnapshot();
  return snap.recordings.find((r) => r.id === id) ?? null;
}

export async function saveStudioRecording(
  useDatabase: boolean,
  input: SaveStudioRecordingInput,
): Promise<StudioRecording> {
  const tracks = useDatabase ? await syncTracksToCloudStorage(input.tracks) : input.tracks;
  const payload = tracks === input.tracks ? input : { ...input, tracks };

  let saved: StudioRecording | null = null;
  if (useDatabase) {
    const res = await fetch("/api/studio/recordings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const body = (await res.json()) as { recording: StudioRecording };
      saved = body.recording;
    }
  }

  if (!saved) {
    const snap = readLocalStudioSnapshot();
    const now = new Date().toISOString();
    const existing = input.id ? snap.recordings.find((r) => r.id === input.id) : undefined;
    const maxEnd = input.tracks.reduce((m, t) => Math.max(m, t.offsetMs + t.durationMs), 0);
    const peaks = computeLocalPeaks(input.tracks);
    saved = {
      id: existing?.id ?? input.id ?? makeLocalId("rec"),
      collectionId: input.collectionId,
      title: input.title.trim().slice(0, 160) || "Untitled take",
      description: input.description?.trim() || null,
      bpm: input.bpm ?? 120,
      countInBars: input.countInBars ?? 0,
      durationMs: Math.max(input.durationMs, maxEnd),
      masterGain: input.masterGain ?? 1,
      trackCount: input.tracks.length,
      markerCount: input.markers.length,
      peaks,
      tags: input.tags ?? [],
      hasTranscript: Boolean(existing?.transcript),
      hasSummary: Boolean(existing?.summary),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      tracks: input.tracks,
      markers: input.markers,
      transcript: existing?.transcript ?? null,
      summary: existing?.summary ?? null,
      chapters: existing?.chapters ?? null,
    };
    snap.recordings = [saved, ...snap.recordings.filter((r) => r.id !== saved!.id)];
    writeLocalStudioSnapshot(snap);
  }

  nexusBus.emit(
    "studio:recording-saved",
    {
      recordingId: saved.id,
      collectionId: saved.collectionId,
      title: saved.title,
      durationMs: saved.durationMs,
      trackCount: saved.tracks.length,
    },
    STUDIO_NODE_ID,
  );

  return saved;
}

export async function deleteStudioRecording(useDatabase: boolean, id: string): Promise<boolean> {
  if (useDatabase) {
    const res = await fetch(`/api/studio/recordings/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) return true;
  }
  const snap = readLocalStudioSnapshot();
  const next = snap.recordings.filter((r) => r.id !== id);
  writeLocalStudioSnapshot({ ...snap, recordings: next });
  return next.length !== snap.recordings.length;
}

export function buildRecordingEnvelope(r: StudioRecording): StudioRecordingContentV1 {
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

/** Emits a typed `studio:take-routed` envelope across Nexus for downstream nodes (Video Studio, Study Space, Command, AI). */
export function emitStudioTakeRouted(
  recording: StudioRecording,
  options: { targetNodeId?: ExtensionId; intent: StudioRoutingIntent },
): StudioRecordingContentV1 {
  const envelope = buildRecordingEnvelope(recording);
  nexusBus.emit(
    "studio:take-routed",
    {
      recordingId: recording.id,
      targetNodeId: options.targetNodeId,
      intent: options.intent,
      title: recording.title,
      envelope,
    },
    STUDIO_NODE_ID,
  );
  return envelope;
}
