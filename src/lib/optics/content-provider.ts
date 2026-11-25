import "server-only";
import { ContentAccessError, type ContentProvider } from "@/lib/content/provider";
import { toOpticsListEnvelope, toOpticsProjectEnvelope } from "./optics-envelope";
import {
  getOpticsProject,
  listOpticsCollections,
  listOpticsProjects,
  setOpticsProjectNotes,
} from "./store";
import type { OpticsProjectAnnotationV1 } from "./types";

/** Optics is the provider of `optics.project`. */
export const opticsProjectProvider: ContentProvider<"optics.project"> = {
  kind: "optics.project",
  versions: [1],
  actions: ["read", "annotate"],

  async collections({ userId }) {
    const cols = await listOpticsCollections(userId, { createDefault: false });
    return cols.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      itemCount: c.projectCount,
      updatedAt: c.updatedAt,
    }));
  },

  async list({ userId }, { collectionId, tag }) {
    const list = await listOpticsProjects(userId, collectionId);
    return (tag ? list.filter((p) => p.tags.includes(tag)) : list).map(toOpticsListEnvelope);
  },

  async get({ userId }, id) {
    const project = await getOpticsProject(userId, id);
    if (!project) throw new ContentAccessError("Optics project not found", "not_found");
    return toOpticsProjectEnvelope(project);
  },

  async annotate({ userId, extensionId }, id, input) {
    const body = (input ?? {}) as Partial<OpticsProjectAnnotationV1>;
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 8000) : "";
    if (!notes) {
      throw new ContentAccessError("notes must be 1-8000 characters", "invalid");
    }
    const updated = await setOpticsProjectNotes(userId, id, {
      notes,
      extensionId,
      updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new ContentAccessError("Optics project not found", "not_found");
    return toOpticsProjectEnvelope(updated);
  },
};
