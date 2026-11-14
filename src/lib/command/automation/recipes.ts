import type { Recipe } from "./types";

/** Recipes that ship with Command. Users switch them on or off; nothing here needs AI. */
export const BUILT_IN_RECIPES: readonly Recipe[] = [
  {
    id: "deep-work-start",
    name: "Deep work",
    summary: "Starting a focus session blocks the calendar, starts your focus playlist, silences Slack and Discord, dims the lights and tracks coding time.",
    trigger: { type: "focus.started" },
    conditions: [],
    actions: [
      { action: "calendar.block", params: { title: "Focus · {{focus.title}}", startsAt: "{{focus.startedAt}}", endsAt: "{{focus.endsAt}}" } },
      { action: "music.play", params: { mood: "focus" } },
      { action: "presence.dnd", params: { until: "{{focus.endsAt}}", status: "Deep work · back {{focus.endsAt}}" } },
      { action: "lights.scene", params: { scene: "focus" } },
      { action: "telemetry.track", params: { label: "{{focus.title}}" } },
    ],
    defaultEnabled: true,
  },
  {
    id: "deep-work-end",
    name: "Deep work wrap-up",
    summary: "Ending a focus session pauses music, clears Do Not Disturb, restores the lights and logs the session on your timeline.",
    trigger: { type: "focus.ended" },
    conditions: [],
    actions: [
      { action: "music.pause" },
      { action: "presence.clear" },
      { action: "lights.scene", params: { scene: "restore" } },
      { action: "activity.log", params: { activity: "focus", title: "Deep work · {{focus.title}}" } },
    ],
    defaultEnabled: true,
  },
  {
    id: "receipt-to-tracker",
    name: "Receipts → tracker + ledger",
    summary: "A receipt or tracking number in Gmail records the purchase on the Nexus network and pins a package tracker to your schedule.",
    trigger: { type: "item.created", kind: "command.message" },
    conditions: [{ path: "receipt.isReceipt", op: "exists" }],
    actions: [
      { action: "purchase.record" },
      { action: "shipment.track" },
      { action: "notify.send", params: { text: "Receipt from {{receipt.merchant}} recorded." } },
    ],
    defaultEnabled: true,
  },
  {
    id: "run-to-goal",
    name: "Run → goal + recovery",
    summary: "Finishing a Strava run checks off your running goal for the day and updates your training load.",
    trigger: { type: "item.created", kind: "command.activity", connectors: ["strava"] },
    conditions: [{ path: "item.data.activity", op: "eq", value: "run" }],
    actions: [
      { action: "goal.check", params: { metric: "run.distance_km", value: "{{item.data.metrics.distance_km}}" } },
      { action: "signal.update", params: { metric: "training.load" } },
    ],
    defaultEnabled: true,
  },
  {
    id: "failed-deploy",
    name: "Failed deploy alert",
    summary: "A failed Vercel deployment creates a high-priority task and sends you an alert.",
    trigger: { type: "item.created", kind: "command.activity", connectors: ["vercel"] },
    conditions: [{ path: "item.data.status", op: "eq", value: "failed" }],
    actions: [
      { action: "task.create", params: { title: "Fix failed deploy · {{item.title}}", priority: "high", url: "{{item.url}}" } },
      { action: "notify.send", params: { text: "Deploy failed: {{item.title}}" } },
    ],
    defaultEnabled: true,
  },
  {
    id: "task-due-soon",
    name: "Due-soon guard",
    summary: "When a task is due within three hours, Command alerts you once.",
    trigger: { type: "item.upcoming", kind: "command.task", withinHours: 3 },
    conditions: [{ path: "item.data.status", op: "eq", value: "open" }],
    actions: [{ action: "notify.send", params: { text: "Due soon: {{item.title}}" } }],
    defaultEnabled: true,
  },
  {
    id: "f1-session-reminder",
    name: "F1 session reminder",
    summary: "An hour before each session of a Grand Prix weekend, Command alerts you.",
    trigger: { type: "item.upcoming", kind: "command.event", connectors: ["f1"], withinHours: 1 },
    conditions: [{ path: "item.data.category", op: "eq", value: "sport" }],
    actions: [{ action: "notify.send", params: { text: "Starting within the hour: {{item.title}}" } }],
    defaultEnabled: false,
  },
];

export function getRecipe(id: string): Recipe | undefined {
  return BUILT_IN_RECIPES.find((r) => r.id === id);
}
