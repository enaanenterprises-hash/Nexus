import { itemTime, type CommandItem, type CommandItemOf } from "./kinds";

export interface TimelineEntry {
  item: CommandItem;
  at: string;
  endsAt: string | null;
  /** Already over (or finished) relative to `now`. */
  past: boolean;
  /** A scheduled event happening right now. */
  live: boolean;
}

export interface DailyTimeline {
  /** `YYYY-MM-DD` in the viewer's time zone. */
  day: string;
  entries: TimelineEntry[];
  /** Index in `entries` where the now marker goes. */
  nowIndex: number;
  /** Open tasks without a time today, and tasks finished today. */
  anytime: CommandItemOf<"command.task">[];
  signals: CommandItemOf<"command.signal">[];
  /** Shipments that are moving, regardless of ETA day. */
  shipments: CommandItemOf<"command.shipment">[];
  /** Goals due today; they live in their own lane, not on the timeline. */
  goals: CommandItemOf<"command.task">[];
}

export function dayKey(at: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

const TIMED = new Set(["command.event", "command.deadline", "command.activity", "command.task", "command.shipment"]);

/**
 * One ordered day across every connected service. Messages and purchases stay
 * off the timeline (they surface through what automations make of them).
 */
export function buildTimeline(items: readonly CommandItem[], options: { now: Date; timeZone: string }): DailyTimeline {
  const { now, timeZone } = options;
  const today = dayKey(now, timeZone);
  const nowMs = now.getTime();
  const entries: TimelineEntry[] = [];
  const anytime: DailyTimeline["anytime"] = [];
  const signals: DailyTimeline["signals"] = [];
  const shipments: DailyTimeline["shipments"] = [];
  const goals: DailyTimeline["goals"] = [];

  for (const item of items) {
    if (item.kind === "command.signal") {
      signals.push(item);
      continue;
    }
    if (item.kind === "command.shipment" && item.data.status !== "delivered") shipments.push(item);
    if (item.kind === "command.event" && item.data.status === "cancelled") continue;
    if (item.kind === "command.task" && item.data.goal) {
      if (item.data.dueAt && dayKey(item.data.dueAt, timeZone) === today) goals.push(item);
      continue;
    }
    if (item.kind === "command.task") {
      const doneToday = item.data.status === "done" && item.data.doneAt && dayKey(item.data.doneAt, timeZone) === today;
      const dueToday = item.data.dueAt && dayKey(item.data.dueAt, timeZone) === today;
      if (!dueToday && (item.data.status === "open" || doneToday)) {
        anytime.push(item);
        continue;
      }
    }
    if (!TIMED.has(item.kind)) continue;
    const at = itemTime(item);
    if (!at || dayKey(at, timeZone) !== today) continue;
    const endsAt =
      item.kind === "command.event" ? item.data.endsAt : item.kind === "command.activity" ? item.data.endedAt : null;
    const start = Date.parse(at);
    const end = endsAt ? Date.parse(endsAt) : start;
    entries.push({ item, at, endsAt, past: end < nowMs, live: item.kind === "command.event" && start <= nowMs && nowMs < end });
  }

  entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.item.title.localeCompare(b.item.title));
  anytime.sort((a, b) => Number(a.data.status === "done") - Number(b.data.status === "done") || rank(a) - rank(b));
  signals.sort((a, b) => signalRank(a.data.metric) - signalRank(b.data.metric) || a.data.metric.localeCompare(b.data.metric));
  const nowIndex = entries.findIndex((e) => Date.parse(e.at) > nowMs);
  return { day: today, entries, nowIndex: nowIndex === -1 ? entries.length : nowIndex, anytime, signals, shipments, goals };
}

const SIGNAL_ORDER = ["weather.", "sky.", "training.", "recovery.", "uptime.", "market.fx.", "market.crypto.", "market."];

function signalRank(metric: string): number {
  const i = SIGNAL_ORDER.findIndex((prefix) => metric.startsWith(prefix));
  return i === -1 ? SIGNAL_ORDER.length : i;
}

function rank(task: CommandItemOf<"command.task">): number {
  return { high: 0, medium: 1, low: 2 }[task.data.priority];
}
