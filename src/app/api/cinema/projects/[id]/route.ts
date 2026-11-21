import {
  json,
  jsonError,
  libraryFailure,
  readJson,
  requireLibraryUser,
  str,
} from "@/lib/research/route-helpers";
import {
  deleteCinemaProject,
  getCinemaProject,
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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const { id } = await params;
  try {
    const project = await getCinemaProject(user.userId, id);
    if (!project) return jsonError(404, "Cinema project not found.", "not_found");
    return json({ project });
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
    const current = await getCinemaProject(user.userId, id);
    if (!current) return jsonError(404, "Cinema project not found.", "not_found");
    const fpsRaw = typeof body["fps"] === "number" ? body["fps"] : current.fps;
    const fps: 24 | 30 | 60 = fpsRaw === 24 || fpsRaw === 60 ? fpsRaw : 30;
    const saved = await saveCinemaProject(user.userId, {
      id: current.id,
      collectionId: str(body["collectionId"], 100) ?? current.collectionId,
      title: str(body["title"], 160) ?? current.title,
      description:
        body["description"] === null ? null : str(body["description"], 2000) ?? current.description,
      aspectRatio: (str(body["aspectRatio"], 16) as CinemaAspectRatio | null) ?? current.aspectRatio,
      fps,
      width: typeof body["width"] === "number" ? body["width"] : current.width,
      height: typeof body["height"] === "number" ? body["height"] : current.height,
      durationMs: typeof body["durationMs"] === "number" ? body["durationMs"] : current.durationMs,
      thumbnailUrl:
        body["thumbnailUrl"] === null
          ? null
          : str(body["thumbnailUrl"], 45_000) ?? current.thumbnailUrl,
      background:
        body["background"] && typeof body["background"] === "object"
          ? (body["background"] as CinemaBackground)
          : current.background,
      tracks: Array.isArray(body["tracks"]) ? (body["tracks"] as CinemaTrack[]) : current.tracks,
      clips: Array.isArray(body["clips"]) ? (body["clips"] as CinemaClip[]) : current.clips,
      transitions: Array.isArray(body["transitions"])
        ? (body["transitions"] as CinemaTransition[])
        : current.transitions,
      assets: Array.isArray(body["assets"]) ? (body["assets"] as CinemaAsset[]) : current.assets,
      markers: Array.isArray(body["markers"])
        ? (body["markers"] as CinemaMarker[])
        : current.markers,
      tags: Array.isArray(body["tags"]) ? normalizeCinemaTags(body["tags"]) : current.tags,
    });
    if (!saved) return jsonError(404, "Cinema folder not found.", "not_found");
    return json({ project: saved });
  } catch (error) {
    return libraryFailure(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const { id } = await params;
  try {
    const removed = await deleteCinemaProject(user.userId, id);
    if (!removed) return jsonError(404, "Cinema project not found.", "not_found");
    return json({ ok: true });
  } catch (error) {
    return libraryFailure(error);
  }
}
