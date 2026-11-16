import { after } from "next/server";
import { json, jsonError, libraryFailure, readJson, requireLibraryUser, str } from "@/lib/research/route-helpers";
import { runStudioAnalyzers } from "@/lib/studio/analyzers";
import {
  listRecordings,
  normalizeStudioTags,
  saveRecording,
} from "@/lib/studio/store";
import type { StudioMarkerV1, StudioTrackV1 } from "@/lib/studio/types";

export async function GET(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const search = new URL(request.url).searchParams;
  const collectionId = search.get("collectionId")?.trim() || undefined;
  try {
    return json({ recordings: await listRecordings(user.userId, collectionId) });
  } catch (error) {
    return libraryFailure(error);
  }
}

export async function POST(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const body = await readJson(request);
  const collectionId = str(body?.["collectionId"], 100);
  const title = str(body?.["title"], 160);
  if (!collectionId || !title) {
    return jsonError(400, "Missing studio collection or session title.", "bad_request");
  }

  try {
    const saved = await saveRecording(user.userId, {
      id: str(body?.["id"], 100) ?? undefined,
      collectionId,
      title,
      description: str(body?.["description"], 2000),
      bpm: typeof body?.["bpm"] === "number" ? body["bpm"] : undefined,
      countInBars: typeof body?.["countInBars"] === "number" ? body["countInBars"] : undefined,
      durationMs: typeof body?.["durationMs"] === "number" ? body["durationMs"] : 0,
      masterGain: typeof body?.["masterGain"] === "number" ? body["masterGain"] : undefined,
      tracks: Array.isArray(body?.["tracks"]) ? (body["tracks"] as StudioTrackV1[]) : [],
      markers: Array.isArray(body?.["markers"]) ? (body["markers"] as StudioMarkerV1[]) : [],
      tags: normalizeStudioTags(body?.["tags"]),
    });
    if (!saved) return jsonError(404, "Studio collection not found.", "not_found");
    after(() => runStudioAnalyzers(user.userId, saved.id));
    return json({ recording: saved }, { status: 201 });
  } catch (error) {
    return libraryFailure(error);
  }
}
