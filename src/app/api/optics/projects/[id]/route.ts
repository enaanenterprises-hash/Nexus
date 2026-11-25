import {
  json,
  jsonError,
  libraryFailure,
  readJson,
  requireLibraryUser,
  str,
} from "@/lib/research/route-helpers";
import {
  deleteOpticsProject,
  getOpticsProject,
  normalizeOpticsTags,
  saveOpticsProject,
} from "@/lib/optics/store";
import type {
  OpticsEditLayer,
  OpticsMatteMode,
  OpticsOverlayAsset,
  OpticsSourceAsset,
} from "@/lib/optics/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const { id } = await params;
  try {
    const project = await getOpticsProject(user.userId, id);
    if (!project) return jsonError(404, "Optics project not found.", "not_found");
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
    const current = await getOpticsProject(user.userId, id);
    if (!current) return jsonError(404, "Optics project not found.", "not_found");
    const saved = await saveOpticsProject(user.userId, {
      id: current.id,
      collectionId: str(body["collectionId"], 100) ?? current.collectionId,
      title: str(body["title"], 160) ?? current.title,
      description:
        body["description"] === null ? null : str(body["description"], 2000) ?? current.description,
      width: typeof body["width"] === "number" ? body["width"] : current.width,
      height: typeof body["height"] === "number" ? body["height"] : current.height,
      source:
        body["source"] && typeof body["source"] === "object"
          ? (body["source"] as OpticsSourceAsset)
          : current.source,
      overlays: Array.isArray(body["overlays"])
        ? (body["overlays"] as OpticsOverlayAsset[])
        : current.overlays,
      editStack: Array.isArray(body["editStack"])
        ? (body["editStack"] as OpticsEditLayer[])
        : current.editStack,
      activeLookId:
        body["activeLookId"] === null ? null : str(body["activeLookId"], 80) ?? current.activeLookId,
      matteMode: (str(body["matteMode"], 24) as OpticsMatteMode | null) ?? current.matteMode,
      thumbnailUrl:
        body["thumbnailUrl"] === null
          ? null
          : str(body["thumbnailUrl"], 45_000) ?? current.thumbnailUrl,
      tags: Array.isArray(body["tags"]) ? normalizeOpticsTags(body["tags"]) : current.tags,
    });
    if (!saved) return jsonError(404, "Optics folder not found.", "not_found");
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
    const removed = await deleteOpticsProject(user.userId, id);
    if (!removed) return jsonError(404, "Optics project not found.", "not_found");
    return json({ ok: true });
  } catch (error) {
    return libraryFailure(error);
  }
}
