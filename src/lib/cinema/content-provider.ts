import "server-only";
import { ContentAccessError, type ContentProvider } from "@/lib/content/provider";
import {
  getCinemaProject,
  listCinemaCollections,
  listCinemaProjects,
  setCinemaProjectNotes,
} from "./store";
import type {
  CinemaProject,
  CinemaProjectAnnotationV1,
  CinemaProjectContentV1,
  CinemaProjectListItemV1,
  CinemaProjectSummary,
} from "./types";

function toListEnvelope(p: CinemaProjectSummary): CinemaProjectListItemV1 {
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
      durationMs: p.durationMs,
      clipCount: p.clipCount,
      markerCount: p.markerCount,
      hasLinkedStudioAudio: p.hasLinkedStudioAudio,
      tags: p.tags,
    },
  };
}

export function toCinemaProjectEnvelope(p: CinemaProject): CinemaProjectContentV1 {
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

/** Cinema is the provider of `cinema.project`. */
export const cinemaProjectProvider: ContentProvider<"cinema.project"> = {
  kind: "cinema.project",
  versions: [1],
  actions: ["read", "annotate"],

  async collections({ userId }) {
    const cols = await listCinemaCollections(userId, { createDefault: false });
    return cols.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      itemCount: c.projectCount,
      updatedAt: c.updatedAt,
    }));
  },

  async list({ userId }, { collectionId, tag }) {
    const list = await listCinemaProjects(userId, collectionId);
    return (tag ? list.filter((p) => p.tags.includes(tag)) : list).map(toListEnvelope);
  },

  async get({ userId }, id) {
    const project = await getCinemaProject(userId, id);
    if (!project) throw new ContentAccessError("Cinema project not found", "not_found");
    return toCinemaProjectEnvelope(project);
  },

  async annotate({ userId, extensionId }, id, input) {
    const body = (input ?? {}) as Partial<CinemaProjectAnnotationV1>;
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 8000) : "";
    if (!notes) {
      throw new ContentAccessError("notes must be 1-8000 characters", "invalid");
    }
    const updated = await setCinemaProjectNotes(userId, id, {
      notes,
      extensionId,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new ContentAccessError("Cinema project not found", "not_found");
    return toCinemaProjectEnvelope(updated);
  },
};
