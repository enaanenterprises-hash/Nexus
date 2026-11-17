import { after } from "next/server";
import { json, jsonError, libraryFailure, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers";
import { runStudioAnalyzers } from "@/lib/studio/analyzers";
import {
  deleteRecording,
  getRecording,
  normalizeStudioTags,
  saveRecording,
} from "@/lib/studio/store";
import type { StudioMarkerV1, StudioTrackV1 } from "@/lib/studio/types";
import { deleteStudioAudioObject, sanitizeAudioObjectKey } from "@/lib/supabase/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const { id } = await params;
  try {
    const recording = await getRecording(user.userId, id);
    if (!recording) return jsonError(404, "Recording not found.", "not_found");
    return json({ recording });
  } catch (error) {
    return libraryFailure(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return jsonError(400, "Invalid JSON body.", "bad_request");

  try {
    const current = await getRecording(user.userId, id);
    if (!current) return jsonError(404, "Recording not found.", "not_found");
    const saved = await saveRecording(user.userId, {
      id: current.id,
      collectionId: str(body["collectionId"], 100) ?? current.collectionId,
      title: str(body["title"], 160) ?? current.title,
      description:
        body["description"] === null ? null : str(body["description"], 2000) ?? current.description,
      bpm: typeof body["bpm"] === "number" ? body["bpm"] : current.bpm,
      countInBars:
        typeof body["countInBars"] === "number" ? body["countInBars"] : current.countInBars,
      durationMs:
        typeof body["durationMs"] === "number" ? body["durationMs"] : current.durationMs,
      masterGain:
        typeof body["masterGain"] === "number" ? body["masterGain"] : current.masterGain,
      tracks: Array.isArray(body["tracks"]) ? (body["tracks"] as StudioTrackV1[]) : current.tracks,
      markers: Array.isArray(body["markers"])
        ? (body["markers"] as StudioMarkerV1[])
        : current.markers,
      tags: Array.isArray(body["tags"]) ? normalizeStudioTags(body["tags"]) : current.tags,
    });
    if (!saved) return jsonError(404, "Studio collection not found.", "not_found");
    after(() => runStudioAnalyzers(user.userId, saved.id));
    return json({ recording: saved });
  } catch (error) {
    return libraryFailure(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const { id } = await params;
  try {
    const existing = await getRecording(user.userId, id);
    const removed = await deleteRecording(user.userId, id);
    if (!removed) return jsonError(404, "Recording not found.", "not_found");
    if (existing) {
      const keys = new Set(
        existing.tracks
          .filter((t) => t.audioRef.storage === "url")
          .map((t) => sanitizeAudioObjectKey(t.audioRef.idbKey))
          .filter((k): k is string => Boolean(k)),
      );
      after(async () => {
        await Promise.allSettled([...keys].map((key) => deleteStudioAudioObject(user.userId, key)));
      });
    }
    return json({ ok: true });
  } catch (error) {
    return libraryFailure(error);
  }
}
