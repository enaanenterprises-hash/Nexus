import { json, jsonError, requireCommandUser } from "@/lib/command/api";
import { readJson } from "@/lib/research/route-helpers";
import { deleteItem, updateItem } from "@/lib/storage/store";
import type { VaultItemMetadata } from "@/lib/storage/types";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;
  const { id } = await context.params;
  const body = await readJson(request);
  if (!body) return jsonError(400, "Invalid JSON payload.", "bad_request");

  try {
    const updated = await updateItem(user.userId, id, {
      ...(typeof body["name"] === "string" && body["name"].trim()
        ? { name: body["name"].trim().slice(0, 260) }
        : {}),
      ...(body["folderId"] === null || typeof body["folderId"] === "string"
        ? { folderId: body["folderId"] as string | null }
        : {}),
      ...(typeof body["starred"] === "boolean" ? { starred: body["starred"] } : {}),
      ...(Array.isArray(body["tags"])
        ? { tags: body["tags"].filter((t): t is string => typeof t === "string").slice(0, 20) }
        : {}),
      ...(body["metadata"] && typeof body["metadata"] === "object"
        ? { metadata: body["metadata"] as Partial<VaultItemMetadata> }
        : {}),
    });
    if (!updated) return jsonError(404, "Storage item not found.", "not_found");
    return json({ item: updated });
  } catch (error) {
    console.error("[storage] update item failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not update Storage item.", "db_error");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;
  const { id } = await context.params;
  try {
    await deleteItem(user.userId, id);
    return json({ deleted: true });
  } catch (error) {
    console.error("[storage] delete item failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not remove Storage item.", "db_error");
  }
}
