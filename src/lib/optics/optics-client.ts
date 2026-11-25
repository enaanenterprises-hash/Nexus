"use client";

import { nexusBus } from "@/lib/extensions";
import {
  readLocalOpticsSnapshot,
  writeLocalOpticsSnapshot,
  type LocalOpticsSnapshot,
} from "./optics-db";
import type {
  OpticsCollection,
  OpticsProject,
  OpticsProjectSummary,
  OpticsSourceAsset,
  SaveOpticsProjectInput,
} from "./types";

function makeLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildStarterOpticsProject(
  collectionId: string,
  starterId: NonNullable<OpticsSourceAsset["starterId"]> = "alpine-alpenglow",
): OpticsProject {
  const now = new Date().toISOString();
  const meta =
    starterId === "atelier-portrait"
      ? {
          title: "Studio Ivory Study",
          width: 1120,
          height: 1400,
          mimeType: "image/png",
          byteLength: 0,
          cameraHint: "85mm f/1.4 · ISO 160 · Studio Strobe",
        }
      : starterId === "obsidian-pavilion"
        ? {
            title: "Nocturne Pavilion",
            width: 1500,
            height: 1000,
            mimeType: "image/png",
            byteLength: 0,
            cameraHint: "24mm f/2.0 · ISO 400 · Blue Hour",
          }
        : {
            title: "Autumn Highland Valley",
            width: 1024,
            height: 682,
            mimeType: "image/jpeg",
            byteLength: 264168,
            cameraHint: "35mm f/5.6 · ISO 100 · Natural Light",
          };

  return {
    id: makeLocalId("opt"),
    collectionId,
    title: meta.title,
    description: null,
    width: meta.width,
    height: meta.height,
    source: {
      id: `src-${starterId}`,
      name: meta.title,
      mimeType: meta.mimeType,
      width: meta.width,
      height: meta.height,
      byteLength: meta.byteLength,
      source: "starter",
      starterId,
      idbKey: `starter:${starterId}`,
      cameraHint: meta.cameraHint,
    },
    overlays: [],
    editStack: [],
    activeLookId: "original",
    matteMode: "auto",
    thumbnailUrl: null,
    tags: [],
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

function summarizeLocal(p: OpticsProject): OpticsProjectSummary {
  return {
    id: p.id,
    collectionId: p.collectionId,
    title: p.title,
    description: p.description,
    width: p.width,
    height: p.height,
    layerCount: p.editStack.length,
    activeLookId: p.activeLookId,
    thumbnailUrl: p.thumbnailUrl,
    tags: p.tags,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export async function fetchOpticsDatabaseStatus(): Promise<boolean> {
  try {
    const res = await fetch("/api/optics/status", { cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { database?: { configured?: boolean } };
    return Boolean(body.database?.configured);
  } catch {
    return false;
  }
}

function upgradeLegacyStarterProjects(snap: LocalOpticsSnapshot): boolean {
  let changed = false;
  snap.projects = snap.projects.map((p) => {
    if (
      p.source.idbKey === "starter:alpine-alpenglow" &&
      p.title === "Dolomites First Light" &&
      p.editStack.length === 0
    ) {
      changed = true;
      return {
        ...p,
        title: "Autumn Highland Valley",
        width: 1024,
        height: 682,
        thumbnailUrl: null,
        source: {
          ...p.source,
          name: "Autumn Highland Valley",
          mimeType: "image/jpeg",
          width: 1024,
          height: 682,
          byteLength: 264168,
          cameraHint: "35mm f/5.6 · ISO 100 · Natural Light",
        },
      };
    }
    return p;
  });
  return changed;
}

export async function listOpticsCollectionsClient(useDatabase: boolean): Promise<OpticsCollection[]> {
  if (useDatabase) {
    const res = await fetch("/api/optics/collections", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { collections: OpticsCollection[] };
      return body.collections;
    }
  }

  const snap = readLocalOpticsSnapshot();
  if (snap.collections.length === 0) {
    const now = new Date().toISOString();
    const initial: OpticsCollection = {
      id: "local-optics-darkroom",
      name: "Optics darkroom",
      description: "Non-destructive photographs and Darkroom studies",
      projectCount: snap.projects.length,
      createdAt: now,
      updatedAt: now,
    };
    snap.collections = [initial];
    if (snap.projects.length === 0) {
      snap.projects = [buildStarterOpticsProject(initial.id, "alpine-alpenglow")];
    } else {
      upgradeLegacyStarterProjects(snap);
    }
    writeLocalOpticsSnapshot(snap);
  } else if (upgradeLegacyStarterProjects(snap)) {
    writeLocalOpticsSnapshot(snap);
  }
  return snap.collections.map((c) => ({
    ...c,
    projectCount: snap.projects.filter((p) => p.collectionId === c.id).length,
  }));
}

export async function createOpticsCollectionClient(
  useDatabase: boolean,
  name: string,
  description?: string | null,
): Promise<OpticsCollection> {
  if (useDatabase) {
    const res = await fetch("/api/optics/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description: description ?? null }),
    });
    if (res.ok) {
      const body = (await res.json()) as { collection: OpticsCollection };
      return body.collection;
    }
  }
  const snap = readLocalOpticsSnapshot();
  const now = new Date().toISOString();
  const created: OpticsCollection = {
    id: makeLocalId("ocol"),
    name: name.trim().slice(0, 80),
    description: description?.trim() || null,
    projectCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  snap.collections = [created, ...snap.collections];
  writeLocalOpticsSnapshot(snap);
  return created;
}

export async function listOpticsProjectsClient(
  useDatabase: boolean,
  collectionId?: string,
): Promise<OpticsProjectSummary[]> {
  if (useDatabase) {
    const qs = collectionId ? `?collectionId=${encodeURIComponent(collectionId)}` : "";
    const res = await fetch(`/api/optics/projects${qs}`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { projects: OpticsProjectSummary[] };
      return body.projects;
    }
  }
  const snap = readLocalOpticsSnapshot();
  if (upgradeLegacyStarterProjects(snap)) {
    writeLocalOpticsSnapshot(snap);
  }
  return snap.projects
    .filter((p) => !collectionId || p.collectionId === collectionId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(summarizeLocal);
}

export async function getOpticsProjectClient(
  useDatabase: boolean,
  id: string,
): Promise<OpticsProject | null> {
  if (useDatabase) {
    const res = await fetch(`/api/optics/projects/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { project: OpticsProject };
      return body.project;
    }
  }
  const snap = readLocalOpticsSnapshot();
  if (upgradeLegacyStarterProjects(snap)) {
    writeLocalOpticsSnapshot(snap);
  }
  return snap.projects.find((p) => p.id === id) ?? null;
}

export async function saveOpticsProjectClient(
  useDatabase: boolean,
  input: SaveOpticsProjectInput,
): Promise<OpticsProject> {
  let saved: OpticsProject | null = null;
  if (useDatabase) {
    const method = input.id ? "PATCH" : "POST";
    const url = input.id ? `/api/optics/projects/${encodeURIComponent(input.id)}` : "/api/optics/projects";
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const body = (await res.json()) as { project: OpticsProject };
      saved = body.project;
    }
  }

  if (!saved) {
    const snap = readLocalOpticsSnapshot();
    const now = new Date().toISOString();
    const existing = input.id ? snap.projects.find((p) => p.id === input.id) : undefined;
    saved = {
      id: existing?.id ?? input.id ?? makeLocalId("opt"),
      collectionId: input.collectionId,
      title: input.title,
      description: input.description ?? null,
      width: input.width,
      height: input.height,
      source: input.source,
      overlays: input.overlays ?? existing?.overlays ?? [],
      editStack: input.editStack,
      activeLookId: input.activeLookId ?? null,
      matteMode: input.matteMode ?? existing?.matteMode ?? "auto",
      thumbnailUrl: input.thumbnailUrl ?? existing?.thumbnailUrl ?? null,
      tags: input.tags ?? [],
      notes: existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    snap.projects = [saved, ...snap.projects.filter((p) => p.id !== saved!.id)];
    writeLocalOpticsSnapshot(snap);
  }

  nexusBus.emit(
    "optics:project-saved",
    {
      projectId: saved.id,
      collectionId: saved.collectionId,
      title: saved.title,
      width: saved.width,
      height: saved.height,
      layerCount: saved.editStack.length,
    },
    "dev.nexus.optics",
  );

  return saved;
}

export async function deleteOpticsProjectClient(useDatabase: boolean, id: string): Promise<void> {
  if (useDatabase) {
    await fetch(`/api/optics/projects/${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }
  const snap = readLocalOpticsSnapshot();
  snap.projects = snap.projects.filter((p) => p.id !== id);
  writeLocalOpticsSnapshot(snap);
}
