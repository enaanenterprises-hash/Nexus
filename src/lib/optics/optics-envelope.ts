import type {
  OpticsProject,
  OpticsProjectContentV1,
  OpticsProjectListItemV1,
  OpticsProjectSummary,
} from "./types";

export function toOpticsListEnvelope(p: OpticsProjectSummary): OpticsProjectListItemV1 {
  return {
    kind: "optics.project",
    version: 1,
    id: p.id,
    title: p.title,
    collectionId: p.collectionId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    data: {
      description: p.description,
      width: p.width,
      height: p.height,
      layerCount: p.layerCount,
      activeLookId: p.activeLookId,
      tags: p.tags,
    },
  };
}

export function toOpticsProjectEnvelope(p: OpticsProject): OpticsProjectContentV1 {
  return {
    kind: "optics.project",
    version: 1,
    id: p.id,
    title: p.title,
    collectionId: p.collectionId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    data: {
      description: p.description,
      width: p.width,
      height: p.height,
      layerCount: p.editStack.length,
      activeLookId: p.activeLookId,
      editStack: p.editStack,
      tags: p.tags,
      notes: p.notes,
    },
  };
}
