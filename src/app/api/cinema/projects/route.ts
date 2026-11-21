import {
  json,
  jsonError,
  libraryFailure,
  readJson,
  requireLibraryUser,
  str,
} from "@/lib/research/route-helpers";
import {
  listCinemaProjects,
  normalizeCinemaTags,
  saveCinemaProject,
} from "@/lib/cinema/store";
import type {
  CinemaAspectRatio,
  CinemaAsset,
  CinemaBackground,
  CinemaClip,
  CinemaMarker,
  CinemaTrack,
  CinemaTransition,
} from "@/lib/cinema/types";

export async function GET(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const collectionId = new URL(request.url).searchParams.get("collectionId")?.trim() || undefined;
  try {
    return json({ projects: await listCinemaProjects(user.userId, collectionId) });
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
    return jsonError(400, "Missing Cinema folder or project title.", "bad_request");
  }

  const fpsRaw = typeof body?.["fps"] === "number" ? body["fps"] : 30;
  const fps: 24 | 30 | 60 = fpsRaw === 24 || fpsRaw === 60 ? fpsRaw : 30;

  try {
    const saved = await saveCinemaProject(user.userId, {
      id: str(body?.["id"], 100) ?? undefined,
      collectionId,
      title,
      description: str(body?.["description"], 2000),
      aspectRatio: (str(body?.["aspectRatio"], 16) as CinemaAspectRatio | null) ?? "16:9",
      fps,
      width: typeof body?.["width"] === "number" ? body["width"] : 1920,
      height: typeof body?.["height"] === "number" ? body["height"] : 1080,
      durationMs: typeof body?.["durationMs"] === "number" ? body["durationMs"] : 0,
      thumbnailUrl: str(body?.["thumbnailUrl"], 45_000),
      background: (body?.["background"] ?? {}) as CinemaBackground,
      tracks: Array.isArray(body?.["tracks"]) ? (body["tracks"] as CinemaTrack[]) : [],
      clips: Array.isArray(body?.["clips"]) ? (body["clips"] as CinemaClip[]) : [],
      transitions: Array.isArray(body?.["transitions"])
        ? (body["transitions"] as CinemaTransition[])
        : [],
      assets: Array.isArray(body?.["assets"]) ? (body["assets"] as CinemaAsset[]) : [],
      markers: Array.isArray(body?.["markers"]) ? (body["markers"] as CinemaMarker[]) : [],
      tags: normalizeCinemaTags(body?.["tags"]),
    });
    if (!saved) return jsonError(404, "Cinema folder not found.", "not_found");
    return json({ project: saved }, { status: 201 });
  } catch (error) {
    return libraryFailure(error);
  }
}
