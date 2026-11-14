import { ACTION_DEFINITIONS } from "../actions";
import { itemTime } from "../kinds";
import { parseReceipt } from "../parsers/receipt";
import type { ActionTarget, Condition, PlannedStep, Recipe, RunPlan, StepResult, TriggerEvent } from "./types";

/**
 * Deterministic automation engine: trigger → conditions → actions. Planning
 * is pure; execution hands each planned step to the caller's handler.
 */

export type RunScope = Record<string, unknown>;

export function buildScope(event: TriggerEvent, now: Date): RunScope {
  const scope: RunScope = { now: now.toISOString(), trigger: event.type };
  if (event.type === "item.created" || event.type === "item.upcoming") {
    const item = event.item;
    scope["item"] = item;
    const at = itemTime(item);
    scope["hoursUntil"] = at ? (Date.parse(at) - now.getTime()) / 3_600_000 : null;
    if (item.kind === "command.message") scope["receipt"] = parseReceipt(item.data);
  } else {
    scope["focus"] = event.focus;
  }
  return scope;
}

export function readPath(scope: unknown, path: string): unknown {
  let value: unknown = scope;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function checkCondition(c: Condition, scope: RunScope): boolean {
  const v = readPath(scope, c.path);
  switch (c.op) {
    case "eq":
      return v === c.value;
    case "neq":
      return v !== c.value;
    case "in":
      return Array.isArray(c.value) && c.value.includes(v);
    case "contains":
      return typeof v === "string" ? v.toLowerCase().includes(String(c.value).toLowerCase()) : Array.isArray(v) && v.includes(c.value);
    case "exists":
      return (v !== undefined && v !== null && v !== false) === (c.value ?? true);
    case "gte":
      return typeof v === "number" && v >= Number(c.value);
    case "lte":
      return typeof v === "number" && v <= Number(c.value);
    case "within_hours":
      return typeof v === "number" && v >= 0 && v <= Number(c.value);
  }
}

const TEMPLATE = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Replaces `{{path}}` in strings; a string that is exactly one template keeps the value's type. */
export function resolveParams(params: Record<string, unknown> = {}, scope: RunScope): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value !== "string") {
      out[key] = value;
      continue;
    }
    const whole = /^\{\{\s*([\w.]+)\s*\}\}$/.exec(value);
    out[key] = whole ? readPath(scope, whole[1]!) : value.replace(TEMPLATE, (_, p: string) => String(readPath(scope, p) ?? ""));
  }
  return out;
}

export function matchesTrigger(recipe: Recipe, event: TriggerEvent, now: Date): boolean {
  const t = recipe.trigger;
  if (t.type !== event.type) return false;
  if ((t.type === "item.created" && event.type === "item.created") || (t.type === "item.upcoming" && event.type === "item.upcoming")) {
    if (t.kind !== event.item.kind || (t.connectors && !t.connectors.includes(event.item.data.connectorId))) return false;
    if (t.type === "item.upcoming") {
      const at = itemTime(event.item);
      const hours = at ? (Date.parse(at) - now.getTime()) / 3_600_000 : NaN;
      return hours >= 0 && hours <= t.withinHours;
    }
    return true;
  }
  return true;
}

export function planRun(recipe: Recipe, event: TriggerEvent, targets: readonly ActionTarget[], now: Date): RunPlan {
  const scope = buildScope(event, now);
  if (!matchesTrigger(recipe, event, now) || !recipe.conditions.every((c) => checkCondition(c, scope))) {
    return { recipe, matched: false, steps: [] };
  }
  const steps: PlannedStep[] = recipe.actions.map((step) => {
    const def = ACTION_DEFINITIONS[step.action];
    const params = resolveParams(step.params, scope);
    if (def.dispatch === "core") return { action: step.action, params, targets: [], skipped: null };
    const able = targets.filter((t) => t.actions.includes(step.action)).map((t) => t.connectorId);
    const chosen = def.dispatch === "all" ? able : able.slice(0, 1);
    return { action: step.action, params, targets: chosen, skipped: chosen.length ? null : "No connected service can do this yet." };
  });
  return { recipe, matched: true, steps };
}

export type StepHandler = (step: PlannedStep, connectorId: string | null) => Promise<{ detail: string; itemIds?: string[] }>;

/** Runs every step; one failing step never stops the rest. */
export async function executePlan(plan: RunPlan, handle: StepHandler): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of plan.steps) {
    if (step.skipped) {
      results.push({ action: step.action, connectorId: null, status: "skipped", detail: step.skipped, itemIds: [] });
      continue;
    }
    for (const connectorId of step.targets.length ? step.targets : [null]) {
      try {
        const out = await handle(step, connectorId);
        results.push({ action: step.action, connectorId, status: "ok", detail: out.detail, itemIds: out.itemIds ?? [] });
      } catch (error) {
        results.push({ action: step.action, connectorId, status: "failed", detail: error instanceof Error ? error.message : String(error), itemIds: [] });
      }
    }
  }
  return results;
}

export function runStatus(steps: StepResult[]): "ok" | "partial" | "failed" {
  if (steps.some((s) => s.status === "failed")) return steps.some((s) => s.status === "ok") ? "partial" : "failed";
  return steps.some((s) => s.status === "skipped") ? "partial" : "ok";
}
