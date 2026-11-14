import type { ActionId } from "../actions";
import type { CommandItem, CommandKind } from "../kinds";

export interface FocusSession {
  id: string;
  title: string;
  /** Command item the session is about (an issue, an assignment), if any. */
  targetItemId: string | null;
  minutes: number;
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
}

export type RecipeTrigger =
  | { type: "item.created"; kind: CommandKind; connectors?: string[] }
  /** Fires once per item when its time comes within `withinHours`. Checked on every sync. */
  | { type: "item.upcoming"; kind: CommandKind; connectors?: string[]; withinHours: number }
  | { type: "focus.started" }
  | { type: "focus.ended" };

export type TriggerEvent =
  | { type: "item.created"; item: CommandItem }
  | { type: "item.upcoming"; item: CommandItem }
  | { type: "focus.started"; focus: FocusSession }
  | { type: "focus.ended"; focus: FocusSession };

export type ConditionOp = "eq" | "neq" | "in" | "contains" | "exists" | "gte" | "lte" | "within_hours";

/** `path` reads from the run scope, e.g. `item.data.activity` or `receipt.tracking`. */
export interface Condition {
  path: string;
  op: ConditionOp;
  value?: unknown;
}

export interface ActionStep {
  action: ActionId;
  /** String values may contain `{{path}}` templates resolved against the scope. */
  params?: Record<string, unknown>;
}

export interface Recipe {
  id: string;
  name: string;
  summary: string;
  trigger: RecipeTrigger;
  conditions: Condition[];
  actions: ActionStep[];
  defaultEnabled: boolean;
}

/** A connected service as the engine sees it. */
export interface ActionTarget {
  connectorId: string;
  actions: readonly ActionId[];
}

export interface PlannedStep {
  action: ActionId;
  params: Record<string, unknown>;
  /** Connector ids to run on; empty for core actions. */
  targets: string[];
  skipped: string | null;
}

export interface RunPlan {
  recipe: Recipe;
  matched: boolean;
  steps: PlannedStep[];
}

export interface StepResult {
  action: ActionId;
  connectorId: string | null;
  status: "ok" | "skipped" | "failed";
  detail: string;
  itemIds: string[];
}

export interface AutomationRun {
  id: string;
  recipeId: string;
  recipeName: string;
  trigger: string;
  triggerItemId: string | null;
  status: "ok" | "partial" | "failed";
  steps: StepResult[];
  createdAt: string;
}
