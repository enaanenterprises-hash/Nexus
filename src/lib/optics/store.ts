import "server-only";
import { randomUUID } from "node:crypto";
import { ensureOpticsSchema, getSql } from "@/lib/db/client";
import type {
  OpticsCollection,
  OpticsEditLayer,
  OpticsMatteMode,
  OpticsOverlayAsset,
  OpticsProject,
  OpticsProjectAnnotation,
  OpticsProjectSummary,
  OpticsSourceAsset,
  SaveOpticsProjectInput,
} from "./types";

type Row = Record<string, unknown>;

export const DEFAULT_OPTICS_COLLECTION_NAME = "Optics darkroom";
export const MAX_OPTICS_TAGS = 12;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const time = Date.parse(String(value));
  return Number.isNaN(time) ? String(value) : new Date(time).toISOString();
}

export function normalizeOpticsTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const t = tag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32);
    if (t) out.add(t);
  }
  return [...out].slice(0, MAX_OPTICS_TAGS);
}

function sanitizeSource(raw: unknown): OpticsSourceAsset {
  const s = (raw ?? {}) as Partial<OpticsSourceAsset>;
  const sourceType =
    s.source === "upload" || s.source === "vault" || s.source === "capture" ? s.source : "starter";
  return {
    id: typeof s.id === "string" && s.id.trim() ? s.id.slice(0, 80) : "src-default",
    name: typeof s.name === "string" && s.name.trim() ? s.name.slice(0, 140) : "Autumn Highland Valley",
    mimeType:
      typeof s.mimeType === "string" && s.mimeType.trim() ? s.mimeType.slice(0, 80) : "image/jpeg",
    width: Math.max(1, Math.round(Number(s.width) || 1024)),
    height: Math.max(1, Math.round(Number(s.height) || 682)),
    byteLength: Math.max(0, Math.round(Number(s.byteLength) || 0)),
    source: sourceType,
    ...(s.starterId ? { starterId: s.starterId } : {}),
    idbKey:
      typeof s.idbKey === "string" && s.idbKey.trim()
        ? s.idbKey.slice(0, 160)
        : "starter:alpine-alpenglow",
    ...(s.vaultItemId !== undefined ? { vaultItemId: s.vaultItemId } : {}),
    ...(s.cameraHint !== undefined ? { cameraHint: s.cameraHint } : {}),
  };
}

function sanitizeOverlays(raw: unknown): OpticsOverlayAsset[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 24).filter((o): o is OpticsOverlayAsset => {
    if (!o || typeof o !== "object") return false;
    const obj = o as Partial<OpticsOverlayAsset>;
    return typeof obj.id === "string" && typeof obj.idbKey === "string";
  });
}

function sanitizeStack(raw: unknown): OpticsEditLayer[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 64).filter((l): l is OpticsEditLayer => {
    if (!l || typeof l !== "object") return false;
    const obj = l as Partial<OpticsEditLayer>;
    return typeof obj.id === "string" && typeof obj.toolId === "string" && typeof obj.params === "object";
  });
}

function toProject(row: Row): OpticsProject {
  const matteRaw = String(row["matteMode"] ?? "auto");
  const matteMode: OpticsMatteMode =
    matteRaw === "obsidian" || matteRaw === "grey" || matteRaw === "paper" ? matteRaw : "auto";
  return {
    id: String(row["id"]),
    collectionId: String(row["collectionId"]),
    title: String(row["title"]),
    description: row["description"] ? String(row["description"]) : null,
    width: Math.max(1, Number(row["width"] ?? 1024)),
    height: Math.max(1, Number(row["height"] ?? 682)),
    source: sanitizeSource(row["source"]),
    overlays: sanitizeOverlays(row["overlays"]),
    editStack: sanitizeStack(row["editStack"]),
    activeLookId: row["activeLookId"] ? String(row["activeLookId"]) : null,
    matteMode,
    thumbnailUrl: row["thumbnailUrl"] ? String(row["thumbnailUrl"]) : null,
    tags: Array.isArray(row["tags"]) ? row["tags"].map(String) : [],
    notes: (row["notes"] as OpticsProjectAnnotation | null) ?? null,
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
  };
}

function toSummary(row: Row): OpticsProjectSummary {
  const stack = Array.isArray(row["editStack"]) ? row["editStack"] : [];
  return {
    id: String(row["id"]),
    collectionId: String(row["collectionId"]),
    title: String(row["title"]),
    description: row["description"] ? String(row["description"]) : null,
    width: Math.max(1, Number(row["width"] ?? 1024)),
    height: Math.max(1, Number(row["height"] ?? 682)),
    layerCount: stack.length,
    activeLookId: row["activeLookId"] ? String(row["activeLookId"]) : null,
    thumbnailUrl: row["thumbnailUrl"] ? String(row["thumbnailUrl"]) : null,
    tags: Array.isArray(row["tags"]) ? row["tags"].map(String) : [],
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
  };
}

export async function listOpticsCollections(
  userId: string,
  { createDefault = true }: { createDefault?: boolean } = {},
): Promise<OpticsCollection[]> {
  await ensureOpticsSchema();
  const sql = getSql();
  let rows = (await sql`
    SELECT c.id, c.name, c.description, c."createdAt", c."updatedAt",
           COUNT(p.id)::int AS "projectCount"
    FROM "optics_collection" c
    LEFT JOIN "optics_project" p ON p."collectionId" = c.id AND p."userId" = c."userId"
    WHERE c."userId" = ${userId}
    GROUP BY c.id
    ORDER BY c."updatedAt" DESC
  `) as Row[];

  if (rows.length === 0 && createDefault) {
    const id = randomUUID();
    rows = (await sql`
      INSERT INTO "optics_collection" ("id", "userId", "name", "description")
      VALUES (${id}, ${userId}, ${DEFAULT_OPTICS_COLLECTION_NAME}, ${"Non-destructive photographs and Darkroom studies"})
      RETURNING id, name, description, "createdAt", "updatedAt", 0::int AS "projectCount"
    `) as Row[];
  }

  return rows.map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    description: r["description"] ? String(r["description"]) : null,
    projectCount: Number(r["projectCount"] ?? 0),
    createdAt: iso(r["createdAt"]),
    updatedAt: iso(r["updatedAt"]),
  }));
}

export async function createOpticsCollection(
  userId: string,
  name: string,
  description?: string | null,
): Promise<OpticsCollection> {
  await ensureOpticsSchema();
  const sql = getSql();
  const id = randomUUID();
  const [row] = (await sql`
    INSERT INTO "optics_collection" ("id", "userId", "name", "description")
    VALUES (${id}, ${userId}, ${name.trim().slice(0, 80)}, ${description?.trim().slice(0, 500) || null})
    RETURNING id, name, description, "createdAt", "updatedAt"
  `) as Row[];
  return {
    id: String(row!["id"]),
    name: String(row!["name"]),
    description: row!["description"] ? String(row!["description"]) : null,
    projectCount: 0,
    createdAt: iso(row!["createdAt"]),
    updatedAt: iso(row!["updatedAt"]),
  };
}

export async function listOpticsProjects(
  userId: string,
  collectionId?: string,
): Promise<OpticsProjectSummary[]> {
  await ensureOpticsSchema();
  const sql = getSql();
  const rows = (
    collectionId
      ? await sql`
          SELECT * FROM "optics_project"
          WHERE "userId" = ${userId} AND "collectionId" = ${collectionId}
          ORDER BY "updatedAt" DESC
          LIMIT 200
        `
      : await sql`
          SELECT * FROM "optics_project"
          WHERE "userId" = ${userId}
          ORDER BY "updatedAt" DESC
          LIMIT 200
        `
  ) as Row[];
  return rows.map(toSummary);
}

export async function getOpticsProject(
  userId: string,
  id: string,
): Promise<OpticsProject | null> {
  await ensureOpticsSchema();
  const sql = getSql();
  const [row] = (await sql`
    SELECT * FROM "optics_project"
    WHERE "id" = ${id} AND "userId" = ${userId}
    LIMIT 1
  `) as Row[];
  return row ? toProject(row) : null;
}

export async function saveOpticsProject(
  userId: string,
  input: SaveOpticsProjectInput,
): Promise<OpticsProject | null> {
  await ensureOpticsSchema();
  const sql = getSql();

  const [col] = (await sql`
    SELECT id FROM "optics_collection"
    WHERE "id" = ${input.collectionId} AND "userId" = ${userId}
    LIMIT 1
  `) as Row[];
  if (!col) return null;

  const id = input.id?.trim() || randomUUID();
  const source = sanitizeSource(input.source);
  const overlays = sanitizeOverlays(input.overlays);
  const editStack = sanitizeStack(input.editStack);
  const tags = normalizeOpticsTags(input.tags);
  const matteMode: OpticsMatteMode =
    input.matteMode === "obsidian" || input.matteMode === "grey" || input.matteMode === "paper"
      ? input.matteMode
      : "auto";
  const thumb =
    typeof input.thumbnailUrl === "string" && input.thumbnailUrl.length <= 45_000
      ? input.thumbnailUrl
      : null;

  const [row] = (await sql`
    INSERT INTO "optics_project" (
      "id", "userId", "collectionId", "title", "description",
      "width", "height", "source", "overlays", "editStack",
      "activeLookId", "matteMode", "thumbnailUrl", "tags"
    )
    VALUES (
      ${id}, ${userId}, ${input.collectionId}, ${input.title.trim().slice(0, 160)},
      ${input.description?.trim().slice(0, 2000) || null},
      ${Math.max(1, Math.round(input.width || 1500))},
      ${Math.max(1, Math.round(input.height || 1000))},
      ${JSON.stringify(source)}::jsonb,
      ${JSON.stringify(overlays)}::jsonb,
      ${JSON.stringify(editStack)}::jsonb,
      ${input.activeLookId ?? null},
      ${matteMode},
      ${thumb},
      ${tags}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "collectionId" = EXCLUDED."collectionId",
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "width" = EXCLUDED."width",
      "height" = EXCLUDED."height",
      "source" = EXCLUDED."source",
      "overlays" = EXCLUDED."overlays",
      "editStack" = EXCLUDED."editStack",
      "activeLookId" = EXCLUDED."activeLookId",
      "matteMode" = EXCLUDED."matteMode",
      "thumbnailUrl" = COALESCE(EXCLUDED."thumbnailUrl", "optics_project"."thumbnailUrl"),
      "tags" = EXCLUDED."tags",
      "updatedAt" = now()
    WHERE "optics_project"."userId" = ${userId}
    RETURNING *
  `) as Row[];

  return row ? toProject(row) : null;
}

export async function deleteOpticsProject(userId: string, id: string): Promise<boolean> {
  await ensureOpticsSchema();
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM "optics_project"
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING id
  `) as Row[];
  return rows.length > 0;
}

export async function setOpticsProjectNotes(
  userId: string,
  id: string,
  annotation: OpticsProjectAnnotation,
): Promise<OpticsProject | null> {
  await ensureOpticsSchema();
  const sql = getSql();
  const [row] = (await sql`
    UPDATE "optics_project"
    SET "notes" = ${JSON.stringify(annotation)}::jsonb,
        "updatedAt" = now()
    WHERE "id" = ${id} AND "userId" = ${userId}
    RETURNING *
  `) as Row[];
  return row ? toProject(row) : null;
}
