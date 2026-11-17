import { auth } from "@/auth";
import { databaseUrl, ensureUserStateSchema, getSql } from "@/lib/db/client";
import { json, jsonError, readJson } from "@/lib/research/route-helpers";

function cleanInstalledNodes(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && item.trim() && item.length <= 120) {
      out.push(item.trim());
    }
  }
  return out;
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Sign in to load workspace state.", "unauthorized");
  if (!databaseUrl()) {
    return json({ database: false, installedNodes: null, theme: null });
  }

  try {
    await ensureUserStateSchema();
    const sql = getSql();
    const [row] = await sql`
      SELECT "installedNodes", "theme"
      FROM "nexus_user_state"
      WHERE "userId" = ${userId}
      LIMIT 1
    `;
    const installedNodes = cleanInstalledNodes(row?.["installedNodes"]);
    const theme = row?.["theme"] === "light" || row?.["theme"] === "dark" ? row["theme"] : null;
    return json({ database: true, installedNodes, theme });
  } catch (error) {
    console.error("[user-state] load failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not load user workspace state.", "db_error");
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return jsonError(401, "Sign in to save workspace state.", "unauthorized");
  if (!databaseUrl()) {
    return json({ ok: false, database: false });
  }

  const body = await readJson(request);
  if (!body) return jsonError(400, "Invalid JSON body.", "bad_request");

  const installedNodes = cleanInstalledNodes(body["installedNodes"]);
  const theme = body["theme"] === "light" || body["theme"] === "dark" ? body["theme"] : null;

  try {
    await ensureUserStateSchema();
    const sql = getSql();
    await sql`
      INSERT INTO "nexus_user_state" ("userId", "installedNodes", "theme")
      VALUES (
        ${userId},
        ${installedNodes ? sql.json(installedNodes) : sql.json([])},
        ${theme}
      )
      ON CONFLICT ("userId") DO UPDATE SET
        "installedNodes" = CASE
          WHEN ${installedNodes !== null} THEN EXCLUDED."installedNodes"
          ELSE "nexus_user_state"."installedNodes"
        END,
        "theme" = COALESCE(${theme}, "nexus_user_state"."theme"),
        "updatedAt" = now()
    `;
    return json({ ok: true, database: true });
  } catch (error) {
    console.error("[user-state] save failed", error instanceof Error ? error.message : error);
    return jsonError(500, "Could not save workspace state.", "db_error");
  }
}
