import { json, jsonError, requireCommandUser } from "@/lib/command/api";
import { readJson } from "@/lib/research/route-helpers";
import { upsertItem, ensureDefaultFolders, listItems } from "@/lib/storage/store";
import type { VaultItem, VaultItemKind, VaultItemMetadata } from "@/lib/storage/types";

export async function GET() {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;
  try {
    const [folders, items] = await Promise.all([
      ensureDefaultFolders(user.userId),
      listItems(user.userId),
    ]);
    return json({ folders, items });
  } catch (error) {
    console.error("[storage] list failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not load Command Storage.", "db_error");
  }
}

export async function POST(request: Request) {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;
  const body = await readJson(request);
  const id = typeof body?.["id"] === "string" ? body["id"].trim() : "";
  const name = typeof body?.["name"] === "string" ? body["name"].trim() : "";
  if (!id || !name) {
    return jsonError(400, "Item id and name are required.", "bad_request");
  }

  const now = new Date().toISOString();
  const item: VaultItem = {
    id,
    folderId: typeof body?.["folderId"] === "string" ? body["folderId"] : null,
    name: name.slice(0, 260),
    mimeType:
      typeof body?.["mimeType"] === "string" ? body["mimeType"].slice(0, 120) : "application/octet-stream",
    kind: (typeof body?.["kind"] === "string" ? body["kind"] : "other") as VaultItemKind,
    sizeBytes: typeof body?.["sizeBytes"] === "number" ? Math.max(0, body["sizeBytes"]) : 0,
    blobKey: typeof body?.["blobKey"] === "string" ? body["blobKey"] : null,
    remoteUrl: typeof body?.["remoteUrl"] === "string" ? body["remoteUrl"] : null,
    thumbnailDataUrl:
      typeof body?.["thumbnailDataUrl"] === "string" ? body["thumbnailDataUrl"] : null,
    starred: Boolean(body?.["starred"]),
    tags: Array.isArray(body?.["tags"])
      ? body["tags"].filter((t): t is string => typeof t === "string").slice(0, 20)
      : [],
    metadata:
      body?.["metadata"] && typeof body["metadata"] === "object"
        ? (body["metadata"] as VaultItemMetadata)
        : {},
    createdAt: typeof body?.["createdAt"] === "string" ? body["createdAt"] : now,
    updatedAt: now,
  };

  try {
    const saved = await upsertItem(user.userId, item);
    return json({ item: saved }, { status: 201 });
  } catch (error) {
    console.error("[storage] save item failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not save item to Storage.", "db_error");
  }
}
