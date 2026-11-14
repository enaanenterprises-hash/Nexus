import "server-only"
import { getConnector } from "@/lib/connectors/catalog"
import { VaultError } from "@/lib/connectors/vault"
import type { ActionId } from "./actions"
import { buildScope, executePlan, planRun, runStatus, type StepHandler } from "./automation/engine"
import { BUILT_IN_RECIPES } from "./automation/recipes"
import type { ActionTarget, AutomationRun, FocusSession, PlannedStep, TriggerEvent } from "./automation/types"
import { DriverError, type DriverContext, type DriverRegistry } from "./drivers/types"
import {
  COMMAND_CORE_SOURCE,
  commandItemId,
  type CommandItem,
  type CommandItemInput,
  type CommandItemOf,
  type ItemOrigin,
} from "./kinds"
import type { ParsedReceipt } from "./parsers/receipt"
import * as store from "./store"

const FETCH_TIMEOUT_MS = 12_000
const MAX_CASCADE = 2

export interface CommandResult {
  created: CommandItem[]
  runs: AutomationRun[]
  errors: { connectorId: string; message: string }[]
}

export function stampItem(connectorId: string, origin: ItemOrigin, input: CommandItemInput, now = new Date()): CommandItem {
  const id = commandItemId(connectorId, input.externalId)
  const at = now.toISOString()
  return {
    kind: input.kind,
    version: 1,
    id,
    title: input.title,
    collectionId: connectorId,
    createdAt: at,
    updatedAt: at,
    data: { ...input.data, connectorId, origin, externalId: input.externalId, url: input.url ?? null },
  } as CommandItem
}

function settingsFor(connectorId: string, stored: Record<string, string>): Record<string, string> {
  const defaults = Object.fromEntries((getConnector(connectorId)?.settings ?? []).flatMap((s) => (s.defaultValue ? [[s.key, s.defaultValue]] : [])))
  return { ...defaults, ...Object.fromEntries(Object.entries(stored).filter(([, v]) => v.trim())) }
}

export function driverContext(userId: string, connection: store.StoredConnection, timeZone: string, now: Date): DriverContext {
  return {
    userId,
    connectorId: connection.connectorId,
    credentials: store.readCredentials(connection),
    settings: settingsFor(connection.connectorId, connection.settings),
    now,
    timeZone,
    saveCredentials: async (next) => void (await store.saveConnection(userId, connection.connectorId, { credentials: next })),
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new DriverError(`${label} took too long to answer.`, "upstream")), FETCH_TIMEOUT_MS)),
  ])
}

export function describeError(error: unknown): { message: string; status: "error" | "needs_auth" } {
  if (error instanceof DriverError) return { message: error.message, status: error.code === "auth" ? "needs_auth" : "error" }
  if (error instanceof VaultError) return { message: error.message, status: "needs_auth" }
  console.error("[command] connector failed", error instanceof Error ? error.message : error)
  return { message: "The service could not be reached.", status: "error" }
}

/** Pulls every connected service, stores the snapshot, and runs automations on what is new. */
export async function syncCommand(options: { userId: string; timeZone: string; drivers: DriverRegistry; only?: string; now?: Date }): Promise<CommandResult> {
  const { userId, timeZone, drivers, only } = options
  const now = options.now ?? new Date()
  const connections = (await store.listConnections(userId)).filter((c) => !only || c.connectorId === only)
  const result: CommandResult = { created: [], runs: [], errors: [] }

  const pulls = await Promise.allSettled(
    connections.map(async (connection) => {
      const driver = drivers[connection.connectorId]
      if (!driver?.fetch) return { connection, items: [] as CommandItem[] }
      const ctx = driverContext(userId, connection, timeZone, now)
      const inputs = await withTimeout(driver.fetch(ctx), getConnector(connection.connectorId)?.name ?? connection.connectorId)
      return { connection, items: inputs.map((i) => stampItem(connection.connectorId, "sync", i, now)) }
    }),
  )

  const fresh: CommandItem[] = []
  for (const [index, pull] of pulls.entries()) {
    const connection = connections[index]!
    if (pull.status === "rejected") {
      const { message, status } = describeError(pull.reason)
      result.errors.push({ connectorId: connection.connectorId, message })
      await store.markConnection(userId, connection.connectorId, status, message)
      continue
    }
    if (!drivers[connection.connectorId]?.fetch) continue
    const { created, changed } = await store.upsertItems(userId, pull.value.items)
    await store.pruneSynced(userId, connection.connectorId, pull.value.items.map((i) => i.id))
    await store.markConnection(userId, connection.connectorId, "ok", null)
    // The first sync is a baseline: automations react to what changes afterwards, not to history.
    if (connection.lastSyncAt) fresh.push(...created, ...changed)
    result.created.push(...created)
  }

  const ctx = await automationContext(userId, timeZone, drivers, now)
  for (const item of fresh) await fire(ctx, { type: "item.created", item }, result, 0)
  await fireUpcoming(ctx, result)
  return result
}

interface AutomationContext {
  userId: string
  timeZone: string
  now: Date
  drivers: DriverRegistry
  enabled: Record<string, boolean>
  connections: store.StoredConnection[]
  targets: ActionTarget[]
}

async function automationContext(userId: string, timeZone: string, drivers: DriverRegistry, now: Date): Promise<AutomationContext> {
  const [enabled, connections] = await Promise.all([store.recipeStates(userId), store.listConnections(userId)])
  const targets = connections
    .filter((c) => c.status !== "needs_auth")
    .map((c) => ({
      connectorId: c.connectorId,
      actions: (getConnector(c.connectorId)?.actions ?? []).filter((a) => drivers[c.connectorId]?.actions?.[a]) as ActionId[],
    }))
  return { userId, timeZone, now, drivers, enabled, connections, targets }
}

async function fireUpcoming(ctx: AutomationContext, result: CommandResult) {
  const recipes = BUILT_IN_RECIPES.filter((r) => r.trigger.type === "item.upcoming" && ctx.enabled[r.id])
  if (recipes.length === 0) return
  const items = await store.listRecentItems(ctx.userId, ctx.now)
  for (const recipe of recipes) {
    const candidates = items.filter((item) => planRun(recipe, { type: "item.upcoming", item }, ctx.targets, ctx.now).matched)
    const done = await store.ranFor(ctx.userId, recipe.id, candidates.map((i) => i.id))
    for (const item of candidates) if (!done.has(item.id)) await fire(ctx, { type: "item.upcoming", item }, result, 0, recipe.id)
  }
}

function triggerLabel(event: TriggerEvent): string {
  switch (event.type) {
    case "item.created":
      return `New ${event.item.kind.replace("command.", "")}: ${event.item.title}`
    case "item.upcoming":
      return `Coming up: ${event.item.title}`
    case "focus.started":
      return `Focus started: ${event.focus.title}`
    case "focus.ended":
      return `Focus ended: ${event.focus.title}`
  }
}

async function fire(ctx: AutomationContext, event: TriggerEvent, result: CommandResult, depth: number, onlyRecipe?: string) {
  for (const recipe of BUILT_IN_RECIPES) {
    if (!ctx.enabled[recipe.id] || (onlyRecipe && recipe.id !== onlyRecipe)) continue
    const plan = planRun(recipe, event, ctx.targets, ctx.now)
    if (!plan.matched) continue
    const createdHere: CommandItem[] = []
    const steps = await executePlan(plan, stepHandler(ctx, event, createdHere))
    const run = await store.recordRun(ctx.userId, {
      recipeId: recipe.id,
      recipeName: recipe.name,
      trigger: triggerLabel(event),
      triggerItemId: "item" in event ? event.item.id : null,
      status: runStatus(steps),
      steps,
    })
    result.runs.push(run)
    result.created.push(...createdHere)
    if (depth < MAX_CASCADE) for (const item of createdHere) await fire(ctx, { type: "item.created", item }, result, depth + 1)
  }
}

function stepHandler(ctx: AutomationContext, event: TriggerEvent, createdHere: CommandItem[]): StepHandler {
  const save = async (connectorId: string, inputs: CommandItemInput[]) => {
    const { all, created } = await store.upsertItems(ctx.userId, inputs.map((i) => stampItem(connectorId, "automation", i, ctx.now)))
    createdHere.push(...created)
    return all.map((i) => i.id)
  }
  return async (step: PlannedStep, connectorId: string | null) => {
    if (connectorId) {
      const connection = ctx.connections.find((c) => c.connectorId === connectorId)!
      const run = ctx.drivers[connectorId]!.actions![step.action]!
      const out = await withTimeout(run(driverContext(ctx.userId, connection, ctx.timeZone, ctx.now), step.params), getConnector(connectorId)?.name ?? connectorId)
      return { detail: out.detail, itemIds: out.items?.length ? await save(connectorId, out.items) : [] }
    }
    const out = await coreAction(ctx, event, step)
    return { detail: out.detail, itemIds: out.items?.length ? await save(COMMAND_CORE_SOURCE, out.items) : [] }
  }
}

const CARRIER_DAYS = { ups: 3, usps: 4, fedex: 2, dhl: 4, amazon: 2, other: 5 } as const

/** Actions Command performs itself; deterministic and connector-free. */
async function coreAction(ctx: AutomationContext, event: TriggerEvent, step: PlannedStep): Promise<{ detail: string; items?: CommandItemInput[] }> {
  const scope = buildScope(event, ctx.now)
  const item = "item" in event ? event.item : null
  const p = step.params
  switch (step.action) {
    case "purchase.record": {
      const receipt = scope["receipt"] as ParsedReceipt | undefined
      if (!receipt || !item || item.kind !== "command.message") return { detail: "Nothing to record." }
      if (receipt.total === null) return { detail: `Order from ${receipt.merchant ?? "a merchant"} noted; no total found.` }
      return {
        detail: `Recorded ${receipt.currency} ${receipt.total.toFixed(2)} at ${receipt.merchant ?? "unknown merchant"}.`,
        items: [
          {
            kind: "command.purchase",
            title: `${receipt.merchant ?? "Purchase"} · ${receipt.currency} ${receipt.total.toFixed(2)}`,
            externalId: `purchase-${item.data.externalId}`,
            data: {
              merchant: receipt.merchant ?? "Unknown",
              total: receipt.total,
              currency: receipt.currency ?? "USD",
              orderNumber: receipt.orderNumber,
              purchasedAt: item.data.receivedAt,
              items: receipt.items,
              sourceItemId: item.id,
            },
          },
        ],
      }
    }
    case "shipment.track": {
      const receipt = scope["receipt"] as ParsedReceipt | undefined
      if (!receipt?.tracking || !item || item.kind !== "command.message") return { detail: "No tracking number in this message." }
      const { carrier, number } = receipt.tracking
      const eta = new Date(Date.parse(item.data.receivedAt) + CARRIER_DAYS[carrier] * 86_400_000)
      eta.setUTCHours(22, 0, 0, 0)
      return {
        detail: `Tracking ${carrier.toUpperCase()} ${number}; estimated arrival pinned to the schedule.`,
        items: [
          {
            kind: "command.shipment",
            title: `${receipt.merchant ?? "Package"} · ${carrier.toUpperCase()}`,
            externalId: `shipment-${number}`,
            url: trackingUrl(carrier, number),
            data: {
              carrier,
              trackingNumber: number,
              status: "in_transit",
              eta: eta.toISOString(),
              merchant: receipt.merchant,
              lastEvent: "Estimated from the carrier's typical transit time.",
              purchaseItemId: commandItemId(COMMAND_CORE_SOURCE, `purchase-${item.data.externalId}`),
            },
          },
        ],
      }
    }
    case "goal.check": {
      const metric = String(p["metric"] ?? "")
      const value = Number(p["value"] ?? 0)
      const tasks = (await store.listItems(ctx.userId, "command.task")) as CommandItemOf<"command.task">[]
      const goal = tasks.find((t) => t.data.goal?.metric === metric && t.data.status === "open")
      if (!goal || !goal.data.goal) return { detail: "No open goal for this activity." }
      const progress = (goal.data.goal.progress ?? 0) + value
      const done = progress >= goal.data.goal.target
      await store.updateItemData(ctx.userId, {
        ...goal,
        data: { ...goal.data, status: done ? "done" : "open", doneAt: done ? ctx.now.toISOString() : null, goal: { ...goal.data.goal, progress } },
      })
      const unit = goal.data.goal.unit
      return { detail: done ? `Goal met: ${goal.title} (${progress.toFixed(1)} ${unit}).` : `${progress.toFixed(1)} of ${goal.data.goal.target} ${unit} toward ${goal.title}.` }
    }
    case "signal.update": {
      const activities = (await store.listItems(ctx.userId, "command.activity", { limit: 300 })) as CommandItemOf<"command.activity">[]
      const weekAgo = ctx.now.getTime() - 7 * 86_400_000
      const training = activities.filter((a) => ["run", "ride", "workout"].includes(a.data.activity) && Date.parse(a.data.startedAt) >= weekAgo)
      const minutes = training.reduce((sum, a) => sum + (a.data.durationMin ?? 0), 0)
      const status = minutes > 420 ? "poor" : minutes > 240 ? "fair" : "good"
      return {
        detail: `Training load is ${Math.round(minutes)} min over 7 days.`,
        items: [
          {
            kind: "command.signal",
            title: "Training load",
            externalId: "training.load",
            data: {
              metric: "training.load",
              value: Math.round(minutes),
              unit: "min",
              display: `${Math.round(minutes)} min / 7d`,
              change: null,
              status,
              observedAt: ctx.now.toISOString(),
              details: { sessions: training.length, advice: status === "poor" ? "Take it easy" : status === "fair" ? "Moderate" : "Room to push" },
            },
          },
        ],
      }
    }
    case "task.create": {
      const title = String(p["title"] ?? "Follow up")
      return {
        detail: `Created task “${title}”.`,
        items: [
          {
            kind: "command.task",
            title,
            externalId: `task-${item?.id ?? ctx.now.getTime()}`,
            url: typeof p["url"] === "string" && p["url"] ? p["url"] : null,
            data: { status: "open", priority: (p["priority"] as "high" | "medium" | "low") ?? "medium", dueAt: null, project: null, doneAt: null, goal: null },
          },
        ],
      }
    }
    case "activity.log": {
      const focus = scope["focus"] as FocusSession | undefined
      if (!focus) return { detail: "Nothing to log." }
      const end = focus.endedAt ?? ctx.now.toISOString()
      const minutes = Math.max(1, Math.round((Date.parse(end) - Date.parse(focus.startedAt)) / 60_000))
      return {
        detail: `Logged ${minutes} min of deep work.`,
        items: [
          {
            kind: "command.activity",
            title: String(p["title"] ?? focus.title),
            externalId: `focus-${focus.id}`,
            data: { activity: "focus", status: "completed", startedAt: focus.startedAt, endedAt: end, durationMin: minutes, metrics: { minutes }, detail: null },
          },
        ],
      }
    }
    default:
      return { detail: "Not a core action." }
  }
}

function trackingUrl(carrier: keyof typeof CARRIER_DAYS, number: string): string | null {
  const n = encodeURIComponent(number)
  switch (carrier) {
    case "ups":
      return `https://www.ups.com/track?tracknum=${n}`
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`
    case "dhl":
      return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${n}`
    default:
      return null
  }
}

export async function startFocus(options: {
  userId: string
  timeZone: string
  drivers: DriverRegistry
  title: string
  minutes: number
  targetItemId: string | null
}): Promise<CommandResult & { focus: FocusSession }> {
  const now = new Date()
  const running = await store.activeFocus(options.userId)
  if (running) await store.finishFocus(options.userId, running.id, now)
  const focus = await store.createFocus(options.userId, options, now)
  const result: CommandResult = { created: [], runs: [], errors: [] }
  await fire(await automationContext(options.userId, options.timeZone, options.drivers, now), { type: "focus.started", focus }, result, 0)
  return { ...result, focus }
}

export async function endFocus(options: { userId: string; timeZone: string; drivers: DriverRegistry }): Promise<CommandResult & { focus: FocusSession | null }> {
  const now = new Date()
  const running = await store.activeFocus(options.userId)
  const result: CommandResult = { created: [], runs: [], errors: [] }
  if (!running) return { ...result, focus: null }
  const focus = (await store.finishFocus(options.userId, running.id, now)) ?? running
  await fire(await automationContext(options.userId, options.timeZone, options.drivers, now), { type: "focus.ended", focus }, result, 0)
  return { ...result, focus }
}

/** A user-set daily goal, checked off by automations (e.g. a Strava run). */
export async function createGoal(userId: string, input: { title: string; metric: string; target: number; unit: string; dueAt: string }) {
  const item = stampItem(COMMAND_CORE_SOURCE, "user", {
    kind: "command.task",
    title: input.title,
    externalId: `goal-${input.metric}-${input.dueAt.slice(0, 10)}`,
    data: { status: "open", priority: "medium", dueAt: input.dueAt, project: "Goals", doneAt: null, goal: { metric: input.metric, target: input.target, unit: input.unit, progress: 0 } },
  })
  return (await store.upsertItems(userId, [item])).all[0]!
}

/** Runs a driver's `verify` against credentials and settings that are not saved yet. */
export async function verifyConnection(options: {
  userId: string
  connectorId: string
  credentials: Record<string, string> | null
  settings: Record<string, string>
  timeZone: string
  drivers: DriverRegistry
}) {
  const driver = options.drivers[options.connectorId]
  if (!driver?.verify) return
  const ctx: DriverContext = {
    userId: options.userId,
    connectorId: options.connectorId,
    credentials: options.credentials,
    settings: settingsFor(options.connectorId, options.settings),
    now: new Date(),
    timeZone: options.timeZone,
    saveCredentials: async () => {},
  }
  await withTimeout(driver.verify(ctx), getConnector(options.connectorId)?.name ?? options.connectorId)
}
