import {
  json,
  jsonError,
  libraryFailure,
  readJson,
  requireLibraryUser,
  str,
} from "@/lib/research/route-helpers";
import {
  listOpticsProjects,
  normalizeOpticsTags,
  saveOpticsProject,
} from "@/lib/optics/store";
import type {
  OpticsEditLayer,
  OpticsMatteMode,
  OpticsOverlayAsset,
  OpticsSourceAsset,
} from "@/lib/optics/types";

export async function GET(request: Request) {
  const user = await requireLibraryUser();
  if ("response" in user) return user.response;
  const collectionId = new URL(request.url).searchParams.get("collectionId")?.trim() || undefined;
  try {
    return json({ projects: await listOpticsProjects(user.userId, collectionId) });
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
    return jsonError(400, "Missing Optics folder or project title.", "bad_request");
  }

  try {
    const saved = await saveOpticsProject(user.userId, {
      id: str(body?.["id"], 100) ?? undefined,
      collectionId,
      title,
      description: str(body?.["description"], 2000),
      width: typeof body?.["width"] === "number" ? body["width"] : 1500,
      height: typeof body?.["height"] === "number" ? body["height"] : 1000,
      source: (body?.["source"] ?? {}) as OpticsSourceAsset,
      overlays: Array.isArray(body?.["overlays"])
        ? (body["overlays"] as OpticsOverlayAsset[])
        : [],
      editStack: Array.isArray(body?.["editStack"])
        ? (body["editStack"] as OpticsEditLayer[])
        : [],
      activeLookId: str(body?.["activeLookId"], 80),
      matteMode: (str(body?.["matteMode"], 24) as OpticsMatteMode | null) ?? "auto",
      thumbnailUrl: str(body?.["thumbnailUrl"], 45_000),
      tags: normalizeOpticsTags(body?.["tags"]),
    });
    if (!saved) return jsonError(404, "Optics folder not found.", "not_found");
    return json({ project: saved }, { status: 201 });
  } catch (error) {
    return libraryFailure(error);
  }
}
