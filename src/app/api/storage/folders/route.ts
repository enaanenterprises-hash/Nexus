import { json, jsonError, requireCommandUser } from "@/lib/command/api";
import { readJson } from "@/lib/research/route-helpers";
import { createFolder, listFolders } from "@/lib/storage/store";

export async function GET() {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;
  try {
    return json({ folders: await listFolders(user.userId) });
  } catch (error) {
    console.error("[storage] list folders failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not load folders.", "db_error");
  }
}

export async function POST(request: Request) {
  const user = await requireCommandUser();
  if ("response" in user) return user.response;
  const body = await readJson(request);
  const name = typeof body?.["name"] === "string" ? body["name"].trim() : "";
  if (!name) return jsonError(400, "Folder name is required.", "bad_request");

  try {
    const folder = await createFolder(user.userId, {
      id: typeof body?.["id"] === "string" ? body["id"] : undefined,
      name: name.slice(0, 80),
      description: typeof body?.["description"] === "string" ? body["description"].slice(0, 240) : null,
      parentId: typeof body?.["parentId"] === "string" ? body["parentId"] : null,
    });
    return json({ folder }, { status: 201 });
  } catch (error) {
    console.error("[storage] create folder failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not create folder.", "db_error");
  }
}
