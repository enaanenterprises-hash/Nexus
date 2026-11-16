import type { ContentEnvelope } from "../extensions/content";

/**
 * Normalized content Command publishes to the Nexus network. Every connector
 * maps its service data into one of these kinds so other
 * extensions never need to know which service an item came from.
 */
export const COMMAND_KINDS = [
  "command.event",
  "command.task",
  "command.deadline",
  "command.activity",
  "command.purchase",
  "command.shipment",
  "command.message",
  "command.signal",
] as const;

export type CommandKind = (typeof COMMAND_KINDS)[number];

export const COMMAND_KIND_VERSION = 1;

export const COMMAND_KIND_DESCRIPTIONS: Record<CommandKind, string> = {
  "command.event": "A scheduled block with a start time: meetings, classes, focus blocks, F1 sessions, flights.",
  "command.task": "Something to do: issues, review requests, to-dos, goals.",
  "command.deadline": "A due date: assignments, tickets, filings.",
  "command.activity": "Something that happened: a run, a night's sleep, a deploy, coding time.",
  "command.purchase": "A receipt: merchant, total, currency, order number, line items.",
  "command.shipment": "A tracked package: carrier, tracking number, status, ETA.",
  "command.message": "An inbound message or feed entry: email, chat, SMS, paper alert.",
  "command.signal": "A live reading: weather, sky, a market price, recovery, uptime.",
};

/** Where an item came from: a connector sync, an automation, or the user (goals). */
export type ItemOrigin = "sync" | "automation" | "user";

/** Connector id used for items Command itself creates (automations, focus sessions). */
export const COMMAND_CORE_SOURCE = "command";

interface CommandBaseV1 {
  connectorId: string;
  origin: ItemOrigin;
  /** The service's own id, stable across syncs. */
  externalId: string;
  url: string | null;
}

export interface CommandEventV1 extends CommandBaseV1 {
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  category: "meeting" | "focus" | "class" | "sport" | "travel" | "personal" | "sky" | "other";
  status: "confirmed" | "tentative" | "cancelled";
}

export interface CommandGoalV1 {
  /** e.g. `run.distance_km` */
  metric: string;
  target: number;
  unit: string;
  progress: number;
}

export interface CommandTaskV1 extends CommandBaseV1 {
  status: "open" | "done";
  priority: "high" | "medium" | "low";
  dueAt: string | null;
  project: string | null;
  doneAt: string | null;
  goal: CommandGoalV1 | null;
  /** Optional Google Tasks list id for write-back sync. */
  taskListId?: string | null;
}

export interface CommandDeadlineV1 extends CommandBaseV1 {
  dueAt: string;
  course: string | null;
  status: "upcoming" | "submitted" | "late";
  points: number | null;
}

export interface CommandActivityV1 extends CommandBaseV1 {
  activity: "run" | "ride" | "workout" | "sleep" | "coding" | "deploy" | "commit" | "focus" | "listening" | "other";
  status: "completed" | "failed" | "in_progress";
  startedAt: string;
  endedAt: string | null;
  durationMin: number | null;
  /** Numeric readings, e.g. `{ distance_km: 5.2, pace_min_km: 5.1 }`. */
  metrics: Record<string, number>;
  detail: string | null;
}

export interface CommandPurchaseV1 extends CommandBaseV1 {
  merchant: string;
  total: number;
  currency: string;
  orderNumber: string | null;
  purchasedAt: string;
  items: { name: string; quantity: number; price: number | null }[];
  /** Item id of the message the receipt was found in. */
  sourceItemId: string | null;
}

export type ShipmentCarrier = "ups" | "usps" | "fedex" | "dhl" | "amazon" | "other";

export interface CommandShipmentV1 extends CommandBaseV1 {
  carrier: ShipmentCarrier;
  trackingNumber: string;
  status: "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  eta: string | null;
  merchant: string | null;
  lastEvent: string | null;
  purchaseItemId: string | null;
}

export interface CommandMessageV1 extends CommandBaseV1 {
  channel: "email" | "chat" | "sms" | "feed";
  from: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string;
  labels: string[];
  /** Email only: lets a reply stay in the same thread. Optional, added without a version bump. */
  threadId?: string | null;
  rfcMessageId?: string | null;
}

export interface CommandSignalV1 extends CommandBaseV1 {
  /** Stable metric key, e.g. `weather.now`, `market.BTC-USD`, `recovery.score`. */
  metric: string;
  value: number | null;
  unit: string | null;
  /** Short human reading, e.g. `6° · Overcast`. */
  display: string;
  change: number | null;
  status: "good" | "fair" | "poor" | "neutral";
  observedAt: string;
  details: Record<string, string | number | null>;
}

export interface CommandDataMap {
  "command.event": CommandEventV1;
  "command.task": CommandTaskV1;
  "command.deadline": CommandDeadlineV1;
  "command.activity": CommandActivityV1;
  "command.purchase": CommandPurchaseV1;
  "command.shipment": CommandShipmentV1;
  "command.message": CommandMessageV1;
  "command.signal": CommandSignalV1;
}

export type CommandItemOf<K extends CommandKind> = ContentEnvelope<K, 1, CommandDataMap[K]>;

export type CommandItem = { [K in CommandKind]: CommandItemOf<K> }[CommandKind];

type Base = keyof CommandBaseV1;

/** What a driver or automation hands to Command; base fields are stamped by the service. */
export type CommandItemInput = {
  [K in CommandKind]: {
    kind: K;
    title: string;
    externalId: string;
    url?: string | null;
    data: Omit<CommandDataMap[K], Base>;
  };
}[CommandKind];

export function isCommandKind(value: string): value is CommandKind {
  return (COMMAND_KINDS as readonly string[]).includes(value);
}

export function commandItemId(connectorId: string, externalId: string): string {
  return `${connectorId}:${externalId}`;
}

/** The moment an item sits at on the timeline, or null for untimed items. */
export function itemTime(item: CommandItem): string | null {
  switch (item.kind) {
    case "command.event":
      return item.data.startsAt;
    case "command.task":
      return item.data.dueAt;
    case "command.deadline":
      return item.data.dueAt;
    case "command.activity":
      return item.data.startedAt;
    case "command.purchase":
      return item.data.purchasedAt;
    case "command.shipment":
      return item.data.eta;
    case "command.message":
      return item.data.receivedAt;
    case "command.signal":
      return item.data.observedAt;
  }
}
