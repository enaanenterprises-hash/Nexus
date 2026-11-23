import { json, jsonError, requireCommandUser } from "@/lib/command/api";
import { deleteFolder } from "@/lib/storage/store";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;
  const { id } = await context.params;
  try {
    const deleted = await deleteFolder(user.userId, id);
    if (!deleted) {
      return jsonError(400, "System folders cannot be removed or folder was not found.", "cannot_delete");
    }
    return json({ deleted: true });
  } catch (error) {
    console.error("[storage] delete folder failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not delete folder.", "db_error");
  }
}
