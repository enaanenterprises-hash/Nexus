import "server-only";
import { randomUUID } from "node:crypto";
import { ensureStorageSchema, getSql } from "@/lib/db/client";
import type { SocialPublishResult } from "@/lib/social/platforms";
import {
  DEFAULT_VAULT_FOLDERS,
  type VaultFolder,
  type VaultItem,
  type VaultItemKind,
  type VaultItemMetadata,
} from "./types";

type Row = Record<string, unknown>;

async function db() {
  await ensureStorageSchema();
  return getSql();
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function toFolder(row: Row): VaultFolder {
  return {
    id: String(row["id"]),
    name: String(row["name"]),
    parentId: (row["parentId"] as string | null) ?? null,
    description: (row["description"] as string | null) ?? null,
    system: Boolean(row["system"]),
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
  };
}

function toItem(row: Row): VaultItem {
  return {
    id: String(row["id"]),
    folderId: (row["folderId"] as string | null) ?? null,
    name: String(row["name"]),
    mimeType: String(row["mimeType"]),
    kind: String(row["kind"]) as VaultItemKind,
    sizeBytes: Number(row["sizeBytes"] ?? 0),
    blobKey: (row["blobKey"] as string | null) ?? null,
    remoteUrl: (row["remoteUrl"] as string | null) ?? null,
    thumbnailDataUrl: (row["thumbnailDataUrl"] as string | null) ?? null,
    starred: Boolean(row["starred"]),
    tags: Array.isArray(row["tags"]) ? row["tags"].map(String) : [],
    metadata: ((row["metadata"] as VaultItemMetadata | null) ?? {}) as VaultItemMetadata,
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
  };
}

export async function ensureDefaultFolders(userId: string): Promise<VaultFolder[]> {
  const sql = await db();
  const existing = await sql`
    SELECT * FROM storage_folder WHERE "userId" = ${userId} ORDER BY "system" DESC, "createdAt" ASC
  `;
  if (existing.length === 0) {
    for (const def of DEFAULT_VAULT_FOLDERS) {
      await sql`
        INSERT INTO storage_folder ("id", "userId", "name", "description", "system")
        VALUES (${def.id}, ${userId}, ${def.name}, ${def.description}, true)
        ON CONFLICT ("userId", "id") DO NOTHING
      `;
    }
    const seeded = await sql`
      SELECT * FROM storage_folder WHERE "userId" = ${userId} ORDER BY "system" DESC, "createdAt" ASC
    `;
    return seeded.map(toFolder);
  }
  return existing.map(toFolder);
}

export async function listFolders(userId: string): Promise<VaultFolder[]> {
  return ensureDefaultFolders(userId);
}

export async function createFolder(
  userId: string,
  input: { id?: string; name: string; description?: string | null; parentId?: string | null },
): Promise<VaultFolder> {
  const sql = await db();
  const id = input.id?.trim() || `vdir-${randomUUID().slice(0, 12)}`;
  const [row] = await sql`
    INSERT INTO storage_folder ("id", "userId", "name", "description", "parentId", "system")
    VALUES (${id}, ${userId}, ${input.name}, ${input.description ?? null}, ${input.parentId ?? null}, false)
    ON CONFLICT ("userId", "id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "description" = EXCLUDED."description",
      "updatedAt" = now()
    RETURNING *
  `;
  return toFolder(row!);
}

export async function deleteFolder(userId: string, folderId: string): Promise<boolean> {
  const sql = await db();
  const [target] = await sql`
    SELECT "system" FROM storage_folder WHERE "userId" = ${userId} AND "id" = ${folderId}
  `;
  if (!target || target["system"]) return false;
  await sql.begin(async (tx) => {
    await tx`
      UPDATE storage_item SET "folderId" = NULL, "updatedAt" = now()
      WHERE "userId" = ${userId} AND "folderId" = ${folderId}
    `;
    await tx`
      DELETE FROM storage_folder WHERE "userId" = ${userId} AND "id" = ${folderId} AND "system" = false
    `;
  });
  return true;
}

export async function listItems(userId: string): Promise<VaultItem[]> {
  const sql = await db();
  const rows = await sql`
    SELECT * FROM storage_item WHERE "userId" = ${userId} ORDER BY "updatedAt" DESC LIMIT 400
  `;
  return rows.map(toItem);
}

export async function getItem(userId: string, id: string): Promise<VaultItem | null> {
  const sql = await db();
  const [row] = await sql`
    SELECT * FROM storage_item WHERE "userId" = ${userId} AND "id" = ${id}
  `;
  return row ? toItem(row) : null;
}

export async function upsertItem(userId: string, item: VaultItem): Promise<VaultItem> {
  const sql = await db();
  await ensureDefaultFolders(userId);
  const [row] = await sql`
    INSERT INTO storage_item (
      "id", "userId", "folderId", "name", "mimeType", "kind", "sizeBytes",
      "blobKey", "remoteUrl", "thumbnailDataUrl", "starred", "tags", "metadata"
    ) VALUES (
      ${item.id},
      ${userId},
      ${item.folderId},
      ${item.name},
      ${item.mimeType},
      ${item.kind},
      ${String(Math.max(0, Math.round(item.sizeBytes)))}::text::bigint,
      ${item.blobKey},
      ${item.remoteUrl},
      ${item.thumbnailDataUrl},
      ${item.starred},
      ${item.tags},
      ${JSON.stringify(item.metadata ?? {})}::text::jsonb
    )
    ON CONFLICT ("userId", "id") DO UPDATE SET
      "folderId" = EXCLUDED."folderId",
      "name" = EXCLUDED."name",
      "mimeType" = EXCLUDED."mimeType",
      "kind" = EXCLUDED."kind",
      "sizeBytes" = EXCLUDED."sizeBytes",
      "blobKey" = COALESCE(EXCLUDED."blobKey", storage_item."blobKey"),
      "remoteUrl" = COALESCE(EXCLUDED."remoteUrl", storage_item."remoteUrl"),
      "thumbnailDataUrl" = COALESCE(EXCLUDED."thumbnailDataUrl", storage_item."thumbnailDataUrl"),
      "starred" = EXCLUDED."starred",
      "tags" = EXCLUDED."tags",
      "metadata" = EXCLUDED."metadata",
      "updatedAt" = now()
    RETURNING *
  `;
  return toItem(row!);
}

export async function updateItem(
  userId: string,
  id: string,
  patch: Partial<Pick<VaultItem, "name" | "folderId" | "starred" | "tags" | "metadata">>,
): Promise<VaultItem | null> {
  const existing = await getItem(userId, id);
  if (!existing) return null;
  const merged: VaultItem = {
    ...existing,
    name: patch.name !== undefined ? patch.name : existing.name,
    folderId: patch.folderId !== undefined ? patch.folderId : existing.folderId,
    starred: patch.starred !== undefined ? patch.starred : existing.starred,
    tags: patch.tags !== undefined ? patch.tags : existing.tags,
    metadata: patch.metadata ? { ...existing.metadata, ...patch.metadata } : existing.metadata,
  };
  return upsertItem(userId, merged);
}

export async function deleteItem(userId: string, id: string): Promise<void> {
  const sql = await db();
  await sql`DELETE FROM storage_item WHERE "userId" = ${userId} AND "id" = ${id}`;
}

export async function savePublishJob(
  userId: string,
  input: {
    jobId: string;
    itemId: string | null;
    title: string;
    description: string;
    hashtags: string;
    platforms: Record<string, unknown>;
    results: SocialPublishResult[];
  },
): Promise<void> {
  const sql = await db();
  await sql`
    INSERT INTO social_publish_job ("id", "userId", "itemId", "title", "description", "hashtags", "platforms", "results")
    VALUES (
      ${input.jobId},
      ${userId},
      ${input.itemId},
      ${input.title},
      ${input.description},
      ${input.hashtags},
      ${JSON.stringify(input.platforms)}::text::jsonb,
      ${JSON.stringify(input.results)}::text::jsonb
    )
  `;
}
