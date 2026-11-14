import "server-only"
import { randomUUID } from "node:crypto"
import { ensureCommandSchema, getSql } from "@/lib/db/client"
import { openCredentials, sealCredentials } from "@/lib/connectors/vault"
import type { ConnectionStatus, ConnectionView } from "@/lib/connectors/types"
import { BUILT_IN_RECIPES } from "./automation/recipes"
import type { AutomationRun, FocusSession, StepResult } from "./automation/types"
import { itemTime, type CommandItem, type CommandKind } from "./kinds"

/** Every query is scoped by `userId`. */

type Row = Record<string, unknown>

async function db() {
  await ensureCommandSchema()
  return getSql()
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString()
}

const isoOrNull = (value: unknown) => (value === null || value === undefined ? null : iso(value))

// ——— Connections ———

export interface StoredConnection extends ConnectionView {
  sealed: string | null
}

function toConnection(row: Row): StoredConnection {
  return {
    connectorId: String(row["connectorId"]),
    status: String(row["status"]) as ConnectionStatus,
    hasCredentials: row["credentials"] !== null,
    sealed: (row["credentials"] as string | null) ?? null,
    settings: (row["settings"] as Record<string, string>) ?? {},
    lastSyncAt: isoOrNull(row["lastSyncAt"]),
    lastError: (row["lastError"] as string | null) ?? null,
  }
}

export function publicConnection({ sealed, ...view }: StoredConnection): ConnectionView {
  void sealed
  return view
}

export async function listConnections(userId: string): Promise<StoredConnection[]> {
  const sql = await db()
  const rows = await sql`SELECT * FROM command_connection WHERE "userId" = ${userId} ORDER BY "createdAt"`
  return rows.map(toConnection)
}

export async function getConnection(userId: string, connectorId: string): Promise<StoredConnection | null> {
  const sql = await db()
  const [row] = await sql`SELECT * FROM command_connection WHERE "userId" = ${userId} AND "connectorId" = ${connectorId}`
  return row ? toConnection(row) : null
}

export function readCredentials(connection: StoredConnection): Record<string, string> | null {
  return connection.sealed ? openCredentials(connection.sealed) : null
}

/** Creates or updates a connection. `credentials: undefined` keeps what is stored. */
export async function saveConnection(
  userId: string,
  connectorId: string,
  input: { settings?: Record<string, string>; credentials?: Record<string, string> | null },
): Promise<StoredConnection> {
  const sql = await db()
  const sealed = input.credentials === undefined ? undefined : input.credentials === null ? null : sealCredentials(input.credentials)
  const settings = input.settings ?? {}
  const [row] = await sql`
    INSERT INTO command_connection ("userId", "connectorId", "settings", "credentials", "status")
    VALUES (${userId}, ${connectorId}, ${sql.json(settings)}, ${sealed ?? null}, 'ok')
    ON CONFLICT ("userId", "connectorId") DO UPDATE SET
      "settings" = CASE WHEN ${input.settings === undefined} THEN command_connection."settings" ELSE EXCLUDED."settings" END,
      "credentials" = CASE WHEN ${sealed === undefined} THEN command_connection."credentials" ELSE EXCLUDED."credentials" END,
      "status" = 'ok', "lastError" = NULL, "updatedAt" = now()
    RETURNING *`
  return toConnection(row!)
}

export async function markConnection(userId: string, connectorId: string, status: ConnectionStatus, error: string | null) {
  const sql = await db()
  await sql`
    UPDATE command_connection SET "status" = ${status}, "lastError" = ${error},
      "lastSyncAt" = CASE WHEN ${status === "ok"} THEN now() ELSE "lastSyncAt" END, "updatedAt" = now()
    WHERE "userId" = ${userId} AND "connectorId" = ${connectorId}`
}

export async function deleteConnection(userId: string, connectorId: string) {
  const sql = await db()
  await sql.begin(async (tx) => {
    await tx`DELETE FROM command_item WHERE "userId" = ${userId} AND "connectorId" = ${connectorId} AND "origin" = 'sync'`
    await tx`DELETE FROM command_connection WHERE "userId" = ${userId} AND "connectorId" = ${connectorId}`
  })
}

// ——— Items ———

function toItem(row: Row): CommandItem {
  return {
    kind: String(row["kind"]) as CommandKind,
    version: 1,
    id: String(row["id"]),
    title: String(row["title"]),
    collectionId: String(row["connectorId"]),
    createdAt: iso(row["createdAt"]),
    updatedAt: iso(row["updatedAt"]),
    data: row["data"],
  } as CommandItem
}

/** Upserts items and returns the ones that did not exist before. */
export async function upsertItems(userId: string, items: CommandItem[]): Promise<{ created: CommandItem[]; all: CommandItem[] }> {
  if (items.length === 0) return { created: [], all: [] }
  const sql = await db()
  const created: CommandItem[] = []
  const all: CommandItem[] = []
  for (const item of items) {
    const at = itemTime(item)
    const [row] = await sql`
      INSERT INTO command_item ("userId", "id", "kind", "connectorId", "origin", "title", "data", "occursAt")
      VALUES (${userId}, ${item.id}, ${item.kind}, ${item.data.connectorId}, ${item.data.origin}, ${item.title}, ${sql.json(item.data as never)}, ${at})
      ON CONFLICT ("userId", "id") DO UPDATE SET
        "title" = EXCLUDED."title", "data" = EXCLUDED."data", "occursAt" = EXCLUDED."occursAt", "updatedAt" = now()
      RETURNING *, (xmax = 0) AS "inserted"`
    const stored = toItem(row!)
    all.push(stored)
    if (row!["inserted"]) created.push(stored)
  }
  return { created, all }
}

/** Drops synced items a connector no longer reports (closed issues, past sessions). */
export async function pruneSynced(userId: string, connectorId: string, keepIds: string[]) {
  const sql = await db()
  await sql`
    DELETE FROM command_item WHERE "userId" = ${userId} AND "connectorId" = ${connectorId} AND "origin" = 'sync'
      AND NOT ("id" = ANY(${keepIds}))`
}

export async function updateItemData(userId: string, item: CommandItem): Promise<CommandItem> {
  const sql = await db()
  const [row] = await sql`
    UPDATE command_item SET "data" = ${sql.json(item.data as never)}, "title" = ${item.title}, "occursAt" = ${itemTime(item)}, "updatedAt" = now()
    WHERE "userId" = ${userId} AND "id" = ${item.id} RETURNING *`
  return toItem(row!)
}

/** Items around today: timed within [-2 days, +14 days], plus untimed ones. */
export async function listRecentItems(userId: string, now = new Date()): Promise<CommandItem[]> {
  const sql = await db()
  const from = new Date(now.getTime() - 2 * 86_400_000)
  const to = new Date(now.getTime() + 14 * 86_400_000)
  const rows = await sql`
    SELECT * FROM command_item WHERE "userId" = ${userId}
      AND ("occursAt" IS NULL OR "occursAt" BETWEEN ${from} AND ${to} OR "kind" IN ('command.signal', 'command.shipment', 'command.task'))
    ORDER BY "occursAt" NULLS LAST LIMIT 600`
  return rows.map(toItem)
}

export async function listItems(userId: string, kind: CommandKind, query: { connectorId?: string; limit?: number } = {}): Promise<CommandItem[]> {
  const sql = await db()
  const limit = Math.min(query.limit ?? 200, 500)
  const rows = query.connectorId
    ? await sql`SELECT * FROM command_item WHERE "userId" = ${userId} AND "kind" = ${kind} AND "connectorId" = ${query.connectorId} ORDER BY "occursAt" DESC NULLS LAST LIMIT ${limit}`
    : await sql`SELECT * FROM command_item WHERE "userId" = ${userId} AND "kind" = ${kind} ORDER BY "occursAt" DESC NULLS LAST LIMIT ${limit}`
  return rows.map(toItem)
}

export async function getItem(userId: string, id: string): Promise<CommandItem | null> {
  const sql = await db()
  const [row] = await sql`SELECT * FROM command_item WHERE "userId" = ${userId} AND "id" = ${id}`
  return row ? toItem(row) : null
}

export async function itemCollections(userId: string, kind: CommandKind) {
  const sql = await db()
  const rows = await sql`
    SELECT "connectorId", count(*)::int AS "count", max("updatedAt") AS "updatedAt"
    FROM command_item WHERE "userId" = ${userId} AND "kind" = ${kind} GROUP BY "connectorId" ORDER BY "connectorId"`
  return rows.map((r) => ({ connectorId: String(r["connectorId"]), count: Number(r["count"]), updatedAt: iso(r["updatedAt"]) }))
}

// ——— Automations ———

export async function recipeStates(userId: string): Promise<Record<string, boolean>> {
  const sql = await db()
  const rows = await sql`SELECT "recipeId", "enabled" FROM command_recipe_state WHERE "userId" = ${userId}`
  const stored = new Map(rows.map((r) => [String(r["recipeId"]), Boolean(r["enabled"])]))
  return Object.fromEntries(BUILT_IN_RECIPES.map((r) => [r.id, stored.get(r.id) ?? r.defaultEnabled]))
}

export async function setRecipeState(userId: string, recipeId: string, enabled: boolean) {
  const sql = await db()
  await sql`
    INSERT INTO command_recipe_state ("userId", "recipeId", "enabled") VALUES (${userId}, ${recipeId}, ${enabled})
    ON CONFLICT ("userId", "recipeId") DO UPDATE SET "enabled" = EXCLUDED."enabled"`
}

function toRun(row: Row): AutomationRun {
  return {
    id: String(row["id"]),
    recipeId: String(row["recipeId"]),
    recipeName: String(row["recipeName"]),
    trigger: String(row["trigger"]),
    triggerItemId: (row["triggerItemId"] as string | null) ?? null,
    status: String(row["status"]) as AutomationRun["status"],
    steps: row["steps"] as StepResult[],
    createdAt: iso(row["createdAt"]),
  }
}

export async function recordRun(userId: string, run: Omit<AutomationRun, "id" | "createdAt">): Promise<AutomationRun> {
  const sql = await db()
  const [row] = await sql`
    INSERT INTO command_automation_run ("id", "userId", "recipeId", "recipeName", "trigger", "triggerItemId", "status", "steps")
    VALUES (${randomUUID()}, ${userId}, ${run.recipeId}, ${run.recipeName}, ${run.trigger}, ${run.triggerItemId}, ${run.status}, ${sql.json(run.steps as never)})
    RETURNING *`
  return toRun(row!)
}

export async function listRuns(userId: string, limit = 30): Promise<AutomationRun[]> {
  const sql = await db()
  const rows = await sql`SELECT * FROM command_automation_run WHERE "userId" = ${userId} ORDER BY "createdAt" DESC LIMIT ${limit}`
  return rows.map(toRun)
}

/** Recipe + item pairs that already ran, so `item.upcoming` fires once per item. */
export async function ranFor(userId: string, recipeId: string, itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set()
  const sql = await db()
  const rows = await sql`
    SELECT DISTINCT "triggerItemId" FROM command_automation_run
    WHERE "userId" = ${userId} AND "recipeId" = ${recipeId} AND "triggerItemId" = ANY(${itemIds})`
  return new Set(rows.map((r) => String(r["triggerItemId"])))
}

// ——— Focus ———

function toFocus(row: Row): FocusSession {
  return {
    id: String(row["id"]),
    title: String(row["title"]),
    targetItemId: (row["targetItemId"] as string | null) ?? null,
    minutes: Number(row["minutes"]),
    startedAt: iso(row["startedAt"]),
    endsAt: iso(row["endsAt"]),
    endedAt: isoOrNull(row["endedAt"]),
  }
}

export async function activeFocus(userId: string): Promise<FocusSession | null> {
  const sql = await db()
  const [row] = await sql`SELECT * FROM command_focus WHERE "userId" = ${userId} AND "endedAt" IS NULL ORDER BY "startedAt" DESC LIMIT 1`
  return row ? toFocus(row) : null
}

export async function createFocus(userId: string, input: { title: string; minutes: number; targetItemId: string | null }, now = new Date()) {
  const sql = await db()
  const endsAt = new Date(now.getTime() + input.minutes * 60_000)
  const [row] = await sql`
    INSERT INTO command_focus ("id", "userId", "title", "targetItemId", "minutes", "startedAt", "endsAt")
    VALUES (${randomUUID()}, ${userId}, ${input.title}, ${input.targetItemId}, ${input.minutes}, ${now}, ${endsAt}) RETURNING *`
  return toFocus(row!)
}

export async function finishFocus(userId: string, id: string, now = new Date()): Promise<FocusSession | null> {
  const sql = await db()
  const [row] = await sql`
    UPDATE command_focus SET "endedAt" = ${now} WHERE "userId" = ${userId} AND "id" = ${id} AND "endedAt" IS NULL RETURNING *`
  return row ? toFocus(row) : null
}
