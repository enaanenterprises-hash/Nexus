"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Cloud,
  CloudSun,
  Command as CommandIcon,
  Forward,
  Inbox,
  Lock,
  Mail,
  Moon,
  Pause,
  PenSquare,
  Play,
  Plus,
  Radio,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Zap,
} from "lucide-react";
import {
  EcosystemBridgeVisual,
  NeuralNetworkPreview,
  type EcosystemLayer,
} from "./WorkspaceVisuals";

type PreviewTheme = "dark" | "light";
type CommandTab = "overview" | "automations" | "connections";
type CommandPreset = "morning" | "deep-work";

/* ─── Layer Metadata (3 Switchable Menus — Pill Bar + Stage Caption) ──────── */

const LAYER_TABS: Array<{
  id: EcosystemLayer;
  title: string;
  description: string;
}> = [
  {
    id: "network",
    title: "Neural Network",
    description: "Your personal assistant—wired live across your schedule, inbox, and tools.",
  },
  {
    id: "command",
    title: "Command",
    description: "Your daily dashboard—uniting calendar, mail, tasks, focus, and automations.",
  },
  {
    id: "nodes",
    title: "Nodes",
    description: "Modular extensions—isolated tools snapped into capability-scoped sockets.",
  },
];

/* ─── Command Preview Data (Mirrors Real /dashboard CommandView) ──────────── */

type MailMessage = {
  id: string;
  sender: string;
  subject: string;
  time: string;
  unread?: boolean;
  body: string[];
};

const MAIL_MESSAGES: MailMessage[] = [
  {
    id: "elena",
    sender: "Elena Vance",
    subject: "Q4 Architecture Review",
    time: "9:42 AM",
    unread: true,
    body: [
      "The shared workspace socket spec is ready for review ahead of Friday's build. Let me know if the Command grid timing looks clean.",
      "Best,\nElena",
    ],
  },
  {
    id: "devon",
    sender: "Devon Patel",
    subject: "Studio Audio Routing",
    time: "Yesterday",
    body: [
      "Multi-track capture export with cloud sync tested cleanly on Chrome and Safari.",
      "Ready to wire the Daily Brief socket handoff next.",
    ],
  },
  {
    id: "github",
    sender: "GitHub",
    subject: "PR #48 merged to main",
    time: "Nov 16",
    body: [
      "Merged #48: Expand Command calendar to a 30-day month view with incremental OAuth scopes.",
      "All extension contract smoke checks passed.",
    ],
  },
];

const NOVEMBER_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const CALENDAR_EVENTS: Record<number, string> = {
  4: "10:00 Product sync",
  11: "13:30 Extension SDK review",
  18: "14:00 Deep work · Socket runtime",
  24: "11:00 Las Vegas GP recap",
};

const INITIAL_TASKS = [
  { id: "t1", title: "Review Q4 socket spec with Elena", tag: "Mail", done: false },
  { id: "t2", title: "Route Studio take 03 to Daily Brief", tag: "Nodes", done: true },
  { id: "t3", title: "Verify AES-256 vault rotation logs", tag: "Vault", done: true },
  { id: "t4", title: "Prep 14:00 Deep Work sprint block", tag: "Focus", done: false },
];

const HOURLY_WEATHER = [
  { label: "Now", temp: "11°", icon: "cloud" as const },
  { label: "12pm", temp: "13°", icon: "partly" as const },
  { label: "2pm", temp: "14°", icon: "partly" as const },
  { label: "4pm", temp: "12°", icon: "cloud" as const },
  { label: "6pm", temp: "9°", icon: "cloud" as const },
];

const F1_TIMING = [
  { pos: "1", code: "VER", teamColor: "#3671C6", gap: "Leader", sector: "29.814", lap: "1:34.218", fastest: true },
  { pos: "2", code: "LEC", teamColor: "#E8002D", gap: "+1.412", sector: "30.041", lap: "1:34.609", fastest: false },
  { pos: "3", code: "NOR", teamColor: "#FF8000", gap: "+2.845", sector: "30.188", lap: "1:34.912", fastest: false },
  { pos: "4", code: "HAM", teamColor: "#00A19B", gap: "+4.190", sector: "30.275", lap: "1:35.104", fastest: false },
];

const INITIAL_AUTOMATIONS = [
  {
    id: "auto-focus",
    name: "Deep work quiet mode",
    trigger: "Command · Focus starts",
    action: "Focus Guard · Mute alerts",
    topic: "command:focus-changed",
    enabled: true,
    lastRun: "14m ago",
  },
  {
    id: "auto-studio",
    name: "Route finished takes",
    trigger: "Studio · Take exported",
    action: "Daily Brief · Attach summary",
    topic: "studio:take-routed",
    enabled: true,
    lastRun: "1h ago",
  },
  {
    id: "auto-receipt",
    name: "File billing receipts",
    trigger: "Gmail · Invoice detected",
    action: "Ledger · Append entry",
    topic: "mail:receipt-parsed",
    enabled: false,
    lastRun: "Nov 16",
  },
];

const INITIAL_CONNECTIONS = [
  { id: "gcal", name: "Google Calendar", scope: "calendar.readonly", synced: "18s ago", connected: true },
  { id: "gmail", name: "Gmail", scope: "gmail.readonly", synced: "24s ago", connected: true },
  { id: "github", name: "GitHub", scope: "repo.status · notifications", synced: "2m ago", connected: true },
  { id: "weather", name: "Open-Meteo", scope: "location · Toronto", synced: "4m ago", connected: true },
  { id: "strava", name: "Strava", scope: "activity.read", synced: "Not linked", connected: false },
  { id: "spotify", name: "Spotify", scope: "playback.read", synced: "Not linked", connected: false },
];

/* ─── Nodes Studio Preview Data (Mirrors Real /dashboard NodesView) ───────── */

type NodeModuleDef = {
  id: string;
  monogram: string;
  name: string;
  tagline: string;
  capabilities: string[];
  scope: string;
  topic: string;
  routeMessage: string;
};

const NODE_CATALOG: Record<string, NodeModuleDef> = {
  studio: {
    id: "studio",
    monogram: "St",
    name: "Studio",
    tagline: "Multi-track audio capture routed straight into your workspace.",
    capabilities: ["Audio & Media", "Shared Context", "Cloud Export"],
    scope: "content:studio.recording:read",
    topic: "studio:take-routed",
    routeMessage: "Published “Q4 Product Note — Take 3” → Daily Brief",
  },
  brief: {
    id: "brief",
    monogram: "DB",
    name: "Daily Brief",
    tagline: "Synthesizes schedule, mail, and active takes for Neural Network.",
    capabilities: ["Calendar Read", "Shared Context", "Assistant Feed"],
    scope: "context:brief.digest:write",
    topic: "brief:digest-updated",
    routeMessage: "Compiled 3 priority items → Neural Network Core",
  },
  focus: {
    id: "focus",
    monogram: "FG",
    name: "Focus Guard",
    tagline: "Listens to Command focus timers and quiets distracting alerts.",
    capabilities: ["Focus State", "Notifications", "Automation Hook"],
    scope: "command:focus.session:subscribe",
    topic: "focus:shield-engaged",
    routeMessage: "Engaged 25m quiet shield ← Command timer",
  },
  capture: {
    id: "capture",
    monogram: "QC",
    name: "Quick Capture",
    tagline: "Voice and markdown notes routed directly into Command tasks.",
    capabilities: ["Tasks Write", "Voice Input", "Local Cache"],
    scope: "command:tasks.item:create",
    topic: "capture:note-queued",
    routeMessage: "Queued action item → Command Today Tasks",
  },
  ledger: {
    id: "ledger",
    monogram: "Lg",
    name: "Ledger",
    tagline: "Turns verified receipt emails into personal expense summaries.",
    capabilities: ["Mail Metadata", "Encrypted Vault", "CSV Export"],
    scope: "vault:ledger.entry:append",
    topic: "ledger:receipt-logged",
    routeMessage: "Logged verified invoice → Encrypted Vault",
  },
};

const NODE_COORDS = [
  { x: 96, y: 196 },
  { x: 190, y: 102 },
  { x: 300, y: 70 },
  { x: 410, y: 102 },
  { x: 504, y: 196 },
] as const;

const CONSTELLATION_CORE = { x: 300, y: 266 };

function socketCurvePath(index: number): string {
  const pt = NODE_COORDS[index]!;
  const dx = pt.x - CONSTELLATION_CORE.x;
  const dy = pt.y - CONSTELLATION_CORE.y;
  const c1x = CONSTELLATION_CORE.x + dx * 0.22;
  const c1y = CONSTELLATION_CORE.y + dy * 0.56;
  const c2x = pt.x - dx * 0.16;
  const c2y = pt.y - dy * 0.18;
  return `M ${CONSTELLATION_CORE.x} ${CONSTELLATION_CORE.y} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${pt.x} ${pt.y}`;
}

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/* ─── Authentic Command Dashboard Preview (Monochrome Precision UI) ───────── */

function CommandPreview({ theme }: { theme: PreviewTheme }) {
  const isLight = theme === "light";
  const [subTab, setSubTab] = useState<CommandTab>("overview");
  const [preset, setPreset] = useState<CommandPreset>("morning");
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(24 * 60 + 18);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickNotice, setQuickNotice] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<number>(18);
  const [selectedMailId, setSelectedMailId] = useState<string>("elena");
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [automations, setAutomations] = useState(INITIAL_AUTOMATIONS);
  const [pulsingAutoId, setPulsingAutoId] = useState<string | null>(null);
  const [connections, setConnections] = useState(INITIAL_CONNECTIONS);

  useEffect(() => {
    if (!focusRunning) return;
    const id = window.setInterval(() => {
      setFocusSeconds((prev) => (prev > 0 ? prev - 1 : 25 * 60));
    }, 1000);
    return () => window.clearInterval(id);
  }, [focusRunning]);

  const activeMail = MAIL_MESSAGES.find((m) => m.id === selectedMailId) ?? MAIL_MESSAGES[0]!;
  const completedCount = tasks.filter((t) => t.done).length;

  function triggerAutomationTest(id: string) {
    setPulsingAutoId(id);
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled: true, lastRun: "Just now" } : a)),
    );
    window.setTimeout(() => {
      setPulsingAutoId((curr) => (curr === id ? null : curr));
    }, 1400);
  }

  function runQuickCommand(label: string, action: () => void) {
    action();
    setQuickOpen(false);
    setQuickNotice(label);
    window.setTimeout(() => {
      setQuickNotice((curr) => (curr === label ? null : curr));
    }, 2600);
  }

  const cardSurface = isLight
    ? "border-[#0e0f12]/[0.09] bg-white shadow-[0_1px_2px_rgba(14,15,18,0.04)]"
    : "border-white/[0.08] bg-[#181920]";
  const innerSurface = isLight ? "bg-[#f5f6f8] border-[#0e0f12]/[0.07]" : "bg-[#1f2028] border-white/[0.07]";
  const textPrimary = isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]";
  const textSecondary = isLight ? "text-[#2c2e36]" : "text-[#d1d1d6]";
  const textMuted = isLight ? "text-[#575b66]" : "text-[#9d9da6]";
  const textSubtle = isLight ? "text-[#6c707c]" : "text-[#8a8a94]";

  return (
    <div
      className="min-h-[540px] w-full p-4 sm:min-h-[590px] sm:p-5 lg:p-6"
      style={{ background: isLight ? "#f6f7f9" : "#121318" }}
    >
      {/* Command Header Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-[15px] border px-3.5 py-2.5 sm:px-4 ${cardSurface}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className={`text-[14px] font-semibold tracking-[-0.01em] ${textPrimary}`}>
              Good morning, Elena
            </p>
            <p className={`text-[11.5px] ${textMuted}`}>Thu, Nov 19 · Toronto</p>
          </div>

          <div
            className={`hidden items-center rounded-full border p-0.5 text-[11px] sm:inline-flex ${
              isLight ? "border-[#0e0f12]/[0.09] bg-[#f3f4f6]" : "border-white/[0.08] bg-[#16161d]"
            }`}
          >
            {(
              [
                { id: "morning", label: "Morning Flow" },
                { id: "deep-work", label: "Deep Focus" },
              ] as const
            ).map((item) => {
              const active = preset === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPreset(item.id)}
                  className={`cursor-pointer rounded-full px-2.5 py-1 font-medium transition-colors ${
                    active
                      ? isLight
                        ? "bg-white text-[#0e0f12] shadow-xs"
                        : "bg-white/[0.12] text-[#f5f5f7]"
                      : textMuted
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center Segmented Control */}
        <div
          role="tablist"
          aria-label="Command workspace views"
          className={`inline-flex items-center rounded-full border p-0.5 text-[12px] ${
            isLight ? "border-[#0e0f12]/[0.09] bg-[#f3f4f6]" : "border-white/[0.09] bg-[#15151b]"
          }`}
        >
          {(
            [
              { id: "overview", label: "Overview" },
              { id: "automations", label: "Automations" },
              { id: "connections", label: "Connections" },
            ] as const
          ).map((t) => {
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(t.id)}
                className={`cursor-pointer rounded-full px-3 py-1.5 font-medium transition-colors ${
                  active
                    ? isLight
                      ? "bg-[#0e0f12] text-white"
                      : "bg-[#f5f5f7] text-[#09090b]"
                    : isLight
                      ? "text-[#575b66] hover:text-[#0e0f12]"
                      : "text-[#9d9da6] hover:text-[#f5f5f7]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Right Controls: Live Focus Session Pill + ⌘K Quick Bar */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFocusRunning((r) => !r)}
            aria-label={focusRunning ? "Pause focus timer" : "Start focus timer"}
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              focusRunning
                ? isLight
                  ? "border-[#0e0f12] bg-[#0e0f12] text-white"
                  : "border-white/30 bg-white/[0.15] text-white"
                : isLight
                  ? "border-[#0e0f12]/[0.1] bg-[#f5f6f8] text-[#1c1e24] hover:bg-[#eceef2]"
                  : "border-white/[0.1] bg-[#16161d] text-[#d1d1d6] hover:bg-white/[0.1]"
            }`}
          >
            {focusRunning ? (
              <Pause className="size-3.5" strokeWidth={2} aria-hidden="true" />
            ) : (
              <Play className="size-3.5" strokeWidth={2} aria-hidden="true" />
            )}
            <span className="tabular-nums">{formatClock(focusSeconds)}</span>
            <span className="hidden sm:inline">{focusRunning ? "Focus live" : "Deep work"}</span>
          </button>

          <button
            type="button"
            onClick={() => setQuickOpen((o) => !o)}
            aria-expanded={quickOpen}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              quickOpen
                ? isLight
                  ? "border-[#0e0f12] bg-[#0e0f12] text-white"
                  : "border-white/30 bg-white/[0.16] text-white"
                : isLight
                  ? "border-[#0e0f12]/[0.1] bg-white text-[#22242c] hover:bg-[#f3f4f6]"
                  : "border-white/[0.1] bg-[#16161d] text-[#d1d1d6] hover:bg-white/[0.1]"
            }`}
          >
            <CommandIcon className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span className="font-mono text-[11px]">K</span>
          </button>
        </div>
      </div>

      {/* Inline ⌘K Command Palette Strip */}
      {quickOpen ? (
        <div
          className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[13px] border px-3.5 py-2.5 text-[12px] ${
            isLight
              ? "border-[#0e0f12]/[0.14] bg-white text-[#0e0f12]"
              : "border-white/[0.14] bg-[#14141a] text-[#f5f5f7]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Search className={`size-3.5 ${textSecondary}`} strokeWidth={1.8} aria-hidden="true" />
            <span className="font-medium">Quick command</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                runQuickCommand("Focus session started · Focus Guard notified", () => setFocusRunning(true))
              }
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                isLight
                  ? "border-[#0e0f12]/12 bg-[#f5f6f8] hover:border-[#0e0f12]/35"
                  : "border-white/12 bg-white/[0.05] hover:border-white/35"
              }`}
            >
              Start 25m focus
            </button>
            <button
              type="button"
              onClick={() =>
                runQuickCommand("Opened Automations conduits", () => setSubTab("automations"))
              }
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                isLight
                  ? "border-[#0e0f12]/12 bg-[#f5f6f8] hover:border-[#0e0f12]/35"
                  : "border-white/12 bg-white/[0.05] hover:border-white/35"
              }`}
            >
              Inspect Automations
            </button>
            <button
              type="button"
              onClick={() =>
                runQuickCommand("Opened Connections Vault", () => setSubTab("connections"))
              }
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                isLight
                  ? "border-[#0e0f12]/12 bg-[#f5f6f8] hover:border-[#0e0f12]/35"
                  : "border-white/12 bg-white/[0.05] hover:border-white/35"
              }`}
            >
              Manage Vault
            </button>
          </div>
        </div>
      ) : quickNotice ? (
        <div
          className={`mt-3 flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[12px] ${
            isLight
              ? "border-[#0e0f12]/[0.12] bg-white text-[#0e0f12]"
              : "border-white/[0.14] bg-white/[0.06] text-[#f5f5f7]"
          }`}
        >
          <Zap className="size-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span>{quickNotice}</span>
        </div>
      ) : null}

      {/* ── Sub-view 1: Overview ── */}
      {subTab === "overview" ? (
        <div className="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Calendar Widget */}
          <div className={`rounded-[16px] border p-4 lg:col-span-4 ${cardSurface}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-[14px] font-semibold ${textPrimary}`}>November</p>
              <p className={`truncate text-[11.5px] ${textMuted}`}>
                {CALENDAR_EVENTS[selectedDay] ?? "No events"}
              </p>
            </div>

            <div className={`mt-3 grid grid-cols-7 gap-y-1 text-center text-[10.5px] font-medium ${textSubtle}`}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>

            <div className="mt-1.5 grid grid-cols-7 gap-1 text-center text-[12px] tabular-nums">
              {NOVEMBER_DAYS.map((day) => {
                const hasEvent = Boolean(CALENDAR_EVENTS[day]);
                const isSelected = selectedDay === day;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    className={`relative flex h-7 cursor-pointer flex-col items-center justify-center rounded-[8px] font-medium transition-colors ${
                      isSelected
                        ? isLight
                          ? "bg-[#0e0f12] text-white"
                          : "bg-white/[0.16] text-white"
                        : hasEvent
                          ? isLight
                            ? "text-[#0e0f12] hover:bg-[#0e0f12]/[0.06]"
                            : "text-[#f5f5f7] hover:bg-white/[0.06]"
                          : isLight
                            ? "text-[#575b66] hover:bg-[#0e0f12]/[0.04]"
                            : "text-[#9d9da6] hover:bg-white/[0.04]"
                    }`}
                  >
                    <span>{day}</span>
                    {hasEvent ? (
                      <span
                        className={`h-1 w-1 rounded-full ${
                          isSelected
                            ? isLight
                              ? "bg-white"
                              : "bg-white"
                            : isLight
                              ? "bg-[#0e0f12]/60"
                              : "bg-white/65"
                        }`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2-Pane Gmail Widget */}
          <div
            className={`grid grid-cols-1 overflow-hidden rounded-[16px] border sm:grid-cols-12 lg:col-span-5 ${cardSurface} ${
              preset === "deep-work" ? "opacity-75" : ""
            }`}
          >
            <div
              className={`border-b p-3.5 sm:col-span-5 sm:border-r sm:border-b-0 ${
                isLight ? "border-[#0e0f12]/[0.08]" : "border-white/[0.07]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${textPrimary}`}>
                  <Mail className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                  Gmail
                </span>
                <span className={`inline-flex items-center gap-1 text-[11px] ${textSubtle}`}>
                  <Inbox className="size-3" strokeWidth={1.7} aria-hidden="true" />
                  {preset === "deep-work" ? "Muted" : "Inbox"}
                </span>
              </div>

              <div className="mt-2.5 flex flex-col gap-1">
                {MAIL_MESSAGES.map((m) => {
                  const active = m.id === activeMail.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMailId(m.id)}
                      className={`w-full cursor-pointer rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                        active
                          ? isLight
                            ? "bg-[#eef0f4] text-[#0e0f12]"
                            : "bg-white/[0.09] text-white"
                          : isLight
                            ? "hover:bg-[#f5f6f8]"
                            : "hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1.5 truncate text-[12px] font-medium ${textPrimary}`}>
                          {m.unread ? (
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${isLight ? "bg-[#0e0f12]" : "bg-[#f5f5f7]"}`}
                              aria-hidden="true"
                            />
                          ) : null}
                          {m.sender}
                        </span>
                        <span className={`shrink-0 text-[10.5px] tabular-nums ${textSubtle}`}>{m.time}</span>
                      </div>
                      <p className={`mt-0.5 truncate text-[11.5px] ${textMuted}`}>{m.subject}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col justify-between p-3.5 sm:col-span-7">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-[11.5px] ${textMuted}`}>
                    {activeMail.sender} · {activeMail.time}
                  </p>
                  <div className={`flex items-center gap-2 ${textSubtle}`}>
                    <Reply className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
                    <Forward className="size-3.5" strokeWidth={1.7} aria-hidden="true" />
                  </div>
                </div>
                <p className={`mt-1.5 text-[13.5px] font-semibold ${textPrimary}`}>{activeMail.subject}</p>
                <div className={`mt-2 space-y-2 text-[12px] leading-[1.52] ${textMuted}`}>
                  {activeMail.body.map((paragraph, i) => (
                    <p key={i} className="whitespace-pre-line">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              <div
                className={`mt-3 flex items-center justify-between border-t pt-2.5 text-[11px] ${
                  isLight ? "border-[#0e0f12]/[0.07]" : "border-white/[0.07]"
                } ${textSubtle}`}
              >
                <span className="inline-flex items-center gap-1">
                  <PenSquare className="size-3" strokeWidth={1.7} aria-hidden="true" />
                  Draft with Neural Network
                </span>
                <span>Read-only</span>
              </div>
            </div>
          </div>

          {/* Today Tasks Widget */}
          <div className={`flex flex-col justify-between rounded-[16px] border p-4 lg:col-span-3 ${cardSurface}`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[14px] font-semibold ${textPrimary}`}>Today</p>
                <span className={`text-[11.5px] font-medium tabular-nums ${textSecondary}`}>
                  {completedCount} / {tasks.length} done
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() =>
                      setTasks((prev) =>
                        prev.map((item) => (item.id === task.id ? { ...item, done: !item.done } : item)),
                      )
                    }
                    className={`flex w-full cursor-pointer items-start gap-2.5 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${innerSurface}`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                        task.done
                          ? isLight
                            ? "border-[#0e0f12] bg-[#0e0f12] text-white"
                            : "border-[#f5f5f7] bg-[#f5f5f7] text-[#09090b]"
                          : isLight
                            ? "border-[#0e0f12]/25 bg-white"
                            : "border-white/25 bg-transparent"
                      }`}
                    >
                      {task.done ? <Check className="size-3" strokeWidth={2.5} aria-hidden="true" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[12px] leading-[1.35] ${
                          task.done ? `line-through ${textSubtle}` : textPrimary
                        }`}
                      >
                        {task.title}
                      </p>
                      <span className={`text-[10.5px] ${textSubtle}`}>{task.tag}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div
              className={`mt-3 h-1.5 w-full overflow-hidden rounded-full ${
                isLight ? "bg-[#0e0f12]/[0.08]" : "bg-white/[0.08]"
              }`}
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isLight ? "bg-[#0e0f12]" : "bg-[#f5f5f7]"
                }`}
                style={{ width: `${(completedCount / tasks.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Bottom Row Left: Weather */}
          <div className={`rounded-[16px] border p-4 lg:col-span-5 ${cardSurface}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={`text-[12px] font-medium ${textMuted}`}>Weather · Toronto</p>
                <div className="mt-1 flex items-baseline gap-2.5">
                  <span className={`text-[30px] leading-none font-light tracking-[-0.03em] tabular-nums ${textPrimary}`}>
                    11°
                  </span>
                  <span className={`text-[12.5px] ${textMuted}`}>Partly cloudy · H 14° L 7°</span>
                </div>
              </div>
              <CloudSun className={`size-6 ${textSecondary}`} strokeWidth={1.6} aria-hidden="true" />
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {HOURLY_WEATHER.map((slot) => (
                <div
                  key={slot.label}
                  className={`flex flex-col items-center gap-1 rounded-[10px] border py-2 text-center ${innerSurface}`}
                >
                  <span className={`text-[10.5px] ${textSubtle}`}>{slot.label}</span>
                  {slot.icon === "partly" ? (
                    <CloudSun className={`size-3.5 ${textSecondary}`} strokeWidth={1.7} aria-hidden="true" />
                  ) : (
                    <Cloud className={`size-3.5 ${textMuted}`} strokeWidth={1.7} aria-hidden="true" />
                  )}
                  <span className={`text-[12px] font-medium tabular-nums ${textPrimary}`}>{slot.temp}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Row Right: Formula 1 */}
          <div className={`rounded-[16px] border p-4 lg:col-span-7 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-[14px] font-semibold ${textPrimary}`}>Formula 1</p>
              <span className={`text-[11.5px] ${textMuted}`}>Las Vegas · Qualifying</span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[12px] tabular-nums">
                <thead>
                  <tr
                    className={`border-b text-[10.5px] ${
                      isLight ? "border-[#0e0f12]/[0.08]" : "border-white/[0.08]"
                    } ${textSubtle}`}
                  >
                    <th className="pb-2 font-medium">Pos</th>
                    <th className="pb-2 font-medium">Driver</th>
                    <th className="pb-2 font-medium">Gap</th>
                    <th className="pb-2 font-medium">S2</th>
                    <th className="pb-2 text-right font-medium">Lap</th>
                  </tr>
                </thead>
                <tbody
                  className={
                    isLight ? "divide-y divide-[#0e0f12]/[0.07]" : "divide-y divide-white/[0.06]"
                  }
                >
                  {F1_TIMING.map((row) => (
                    <tr key={row.code}>
                      <td className={`py-2 font-medium ${textMuted}`}>{row.pos}</td>
                      <td className={`py-2 font-semibold ${textPrimary}`}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="h-3 w-1 rounded-full"
                            style={{ backgroundColor: row.teamColor }}
                            aria-hidden="true"
                          />
                          {row.code}
                        </span>
                      </td>
                      <td className={`py-2 ${textMuted}`}>{row.gap}</td>
                      <td className={`py-2 ${row.fastest ? `font-semibold ${textPrimary}` : textMuted}`}>
                        {row.sector}
                      </td>
                      <td className={`py-2 text-right font-medium ${textPrimary}`}>{row.lap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Sub-view 2: Automations ── */}
      {subTab === "automations" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className={`text-[13px] ${textMuted}`}>Deterministic workflows across Command, Neural Network, and Nodes.</p>
            <span className={`font-mono text-[11.5px] tabular-nums ${textSecondary}`}>
              {automations.filter((a) => a.enabled).length} of {automations.length} active
            </span>
          </div>

          <div className="space-y-2.5">
            {automations.map((auto) => {
              const pulsing = pulsingAutoId === auto.id;
              return (
                <div
                  key={auto.id}
                  className={`flex flex-col gap-3 rounded-[16px] border p-4 transition-colors lg:flex-row lg:items-center lg:justify-between ${cardSurface} ${
                    pulsing ? (isLight ? "border-[#0e0f12]/45" : "border-white/40") : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-[14px] font-semibold ${textPrimary}`}>{auto.name}</p>
                      <span className={`font-mono text-[11px] ${textSubtle}`}>{auto.topic}</span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px]">
                      <span className={`rounded-[9px] border px-2.5 py-1 font-medium ${innerSurface} ${textPrimary}`}>
                        {auto.trigger}
                      </span>
                      <span className="inline-flex items-center gap-1" aria-hidden="true">
                        <span
                          className={`h-[1.5px] w-7 transition-colors ${
                            pulsing
                              ? isLight
                                ? "bg-[#0e0f12]"
                                : "bg-white"
                              : auto.enabled
                                ? isLight
                                  ? "bg-[#0e0f12]/45"
                                  : "bg-white/45"
                                : isLight
                                  ? "bg-[#0e0f12]/18"
                                  : "bg-white/18"
                          }`}
                        />
                        <ArrowRight
                          className={`size-3.5 ${auto.enabled ? textPrimary : textSubtle}`}
                          strokeWidth={1.8}
                        />
                      </span>
                      <span className={`rounded-[9px] border px-2.5 py-1 font-medium ${innerSurface} ${textPrimary}`}>
                        {auto.action}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className={`text-[11.5px] tabular-nums ${textSubtle}`}>
                      {pulsing ? "Signal routed" : `Last run ${auto.lastRun}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => triggerAutomationTest(auto.id)}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        isLight
                          ? "border-[#0e0f12]/[0.12] bg-white text-[#0e0f12] hover:border-[#0e0f12]/35"
                          : "border-white/[0.12] bg-[#16161e] text-[#f5f5f7] hover:border-white/35"
                      }`}
                    >
                      <Zap className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                      Run test
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={auto.enabled}
                      aria-label={`Toggle ${auto.name}`}
                      onClick={() =>
                        setAutomations((prev) =>
                          prev.map((item) =>
                            item.id === auto.id ? { ...item, enabled: !item.enabled } : item,
                          ),
                        )
                      }
                      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                        auto.enabled
                          ? isLight
                            ? "bg-[#0e0f12]"
                            : "bg-[#f5f5f7]"
                          : isLight
                            ? "bg-[#d6d8df]"
                            : "bg-white/[0.15]"
                      }`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full shadow-xs transition-transform ${
                          auto.enabled
                            ? isLight
                              ? "translate-x-6 bg-white"
                              : "translate-x-6 bg-[#09090b]"
                            : "translate-x-1 bg-white"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Sub-view 3: Connections ── */}
      {subTab === "connections" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className={`inline-flex items-center gap-2 text-[13px] ${textMuted}`}>
              <ShieldCheck className={`size-4 ${textSecondary}`} strokeWidth={1.75} aria-hidden="true" />
              Incremental OAuth encrypted with AES-256-GCM.
            </span>
            <span className={`text-[12px] font-medium tabular-nums ${textSecondary}`}>
              {connections.filter((c) => c.connected).length} of {connections.length} connected
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className={`flex flex-col justify-between gap-4 rounded-[16px] border p-4 ${cardSurface}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-[14px] font-semibold ${textPrimary}`}>{conn.name}</p>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        conn.connected
                          ? isLight
                            ? "bg-[#0e0f12]/[0.07] text-[#0e0f12]"
                            : "bg-white/[0.1] text-[#f5f5f7]"
                          : isLight
                            ? "bg-[#f1f2f5] text-[#5c606a]"
                            : "bg-white/[0.05] text-[#8e8e95]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          conn.connected
                            ? isLight
                              ? "bg-[#0e0f12]"
                              : "bg-[#f5f5f7]"
                            : "bg-current opacity-40"
                        }`}
                        aria-hidden="true"
                      />
                      {conn.connected ? "Encrypted" : "Disconnected"}
                    </span>
                  </div>
                  <p className={`mt-1.5 font-mono text-[11px] ${textSubtle}`}>{conn.scope}</p>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11.5px] tabular-nums ${textMuted}`}>
                    {conn.connected ? `Synced ${conn.synced}` : "Ready to link"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setConnections((prev) =>
                        prev.map((item) =>
                          item.id === conn.id
                            ? {
                                ...item,
                                connected: !item.connected,
                                synced: !item.connected ? "Just now" : "Not linked",
                              }
                            : item,
                        ),
                      )
                    }
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors ${
                      conn.connected
                        ? isLight
                          ? "border-[#0e0f12]/12 bg-white text-[#22242c] hover:bg-[#f3f4f6]"
                          : "border-white/12 bg-white/[0.04] text-[#d1d1d6] hover:bg-white/[0.09]"
                        : isLight
                          ? "border-[#0e0f12] bg-[#0e0f12] text-white"
                          : "border-white/25 bg-[#f5f5f7] text-[#09090b] hover:bg-white"
                    }`}
                  >
                    {conn.connected ? "Disconnect" : "Connect"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── Authentic Spatial Nodes Studio Preview (Gold strictly on SVG visual) ── */

type BusEvent = {
  id: number;
  time: string;
  topic: string;
  detail: string;
};

function NodesPreview({ theme }: { theme: PreviewTheme }) {
  const isLight = theme === "light";
  const eventSeqRef = useRef(100);
  const [proUnlocked, setProUnlocked] = useState(false);
  const [sockets, setSockets] = useState<Array<string | null>>(["studio", "brief", "focus", null, null]);
  const [selectedSocket, setSelectedSocket] = useState<number>(0);
  const [routingPulse, setRoutingPulse] = useState<{ socketIdx: number; serial: number } | null>(null);
  const [busEvents, setBusEvents] = useState<BusEvent[]>([
    {
      id: 3,
      time: "09:42:18",
      topic: "studio:take-routed",
      detail: "Studio → Daily Brief (Q4 Product Note — Take 3)",
    },
    {
      id: 2,
      time: "09:41:04",
      topic: "focus:shield-engaged",
      detail: "Command timer → Focus Guard (25m quiet block)",
    },
    {
      id: 1,
      time: "09:38:51",
      topic: "brief:digest-updated",
      detail: "Daily Brief → Neural Network Core (3 items)",
    },
  ]);

  const maxSlots = proUnlocked ? 5 : 3;
  const activeCount = sockets.filter((id, idx) => idx < maxSlots && id !== null).length;
  const selectedId = sockets[selectedSocket] ?? null;
  const selectedModule = selectedId ? NODE_CATALOG[selectedId] ?? null : null;
  const selectedLocked = selectedSocket >= maxSlots;

  function pushBusEvent(topic: string, detail: string) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    eventSeqRef.current += 1;
    const id = eventSeqRef.current;
    setBusEvents((prev) => [{ id, time, topic, detail }, ...prev.slice(0, 2)]);
  }

  function routeSocket(idx: number) {
    const modId = sockets[idx];
    if (!modId) return;
    const mod = NODE_CATALOG[modId];
    if (!mod) return;
    setSelectedSocket(idx);
    setRoutingPulse((prev) => ({ socketIdx: idx, serial: (prev?.serial ?? 0) + 1 }));
    pushBusEvent(mod.topic, mod.routeMessage);
  }

  function releaseSocket(idx: number) {
    const modId = sockets[idx];
    if (!modId) return;
    const mod = NODE_CATALOG[modId];
    setSockets((prev) => prev.map((val, i) => (i === idx ? null : val)));
    pushBusEvent("socket:released", `Unmounted ${mod?.name ?? modId} from Socket ${idx + 1}`);
  }

  function snapModule(modId: string, preferredIdx?: number) {
    const existingIdx = sockets.findIndex((id) => id === modId);
    if (existingIdx >= 0) {
      routeSocket(existingIdx);
      return;
    }

    let targetIdx =
      preferredIdx !== undefined && preferredIdx < maxSlots && sockets[preferredIdx] === null
        ? preferredIdx
        : sockets.findIndex((val, idx) => idx < maxSlots && val === null);

    if (targetIdx < 0) {
      setProUnlocked(true);
      targetIdx = sockets.findIndex((val) => val === null);
    }
    if (targetIdx < 0) return;

    const mod = NODE_CATALOG[modId];
    setSockets((prev) => prev.map((val, i) => (i === targetIdx ? modId : val)));
    setSelectedSocket(targetIdx);
    setRoutingPulse((prev) => ({ socketIdx: targetIdx, serial: (prev?.serial ?? 0) + 1 }));
    pushBusEvent("socket:snapped", `Mounted ${mod?.name ?? modId} into Socket ${targetIdx + 1}`);
  }

  const cardSurface = isLight
    ? "border-[#0e0f12]/[0.09] bg-white shadow-[0_1px_2px_rgba(14,15,18,0.04)]"
    : "border-white/[0.08] bg-[#181920]";
  const innerSurface = isLight ? "bg-[#f5f6f8] border-[#0e0f12]/[0.07]" : "bg-[#1f2028] border-white/[0.07]";
  const textPrimary = isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]";
  const textSecondary = isLight ? "text-[#2c2e36]" : "text-[#d1d1d6]";
  const textMuted = isLight ? "text-[#575b66]" : "text-[#9d9da6]";
  const textSubtle = isLight ? "text-[#6c707c]" : "text-[#8a8a94]";

  return (
    <div
      className="min-h-[540px] w-full p-4 sm:min-h-[590px] sm:p-5 lg:p-6"
      style={{ background: isLight ? "#f6f7f9" : "#121318" }}
    >
      {/* Top Studio Header Bar */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 rounded-[15px] border px-4 py-2.5 ${cardSurface}`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className={`text-[14px] font-semibold ${textPrimary}`}>Modular nodes</p>
            <p className={`text-[11.5px] tabular-nums ${textMuted}`}>
              {activeCount} of {maxSlots} sockets active
            </p>
          </div>

          {/* 5-pip monochrome occupancy meter */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {sockets.map((val, idx) => {
              const locked = idx >= maxSlots;
              return (
                <span
                  key={idx}
                  className={`h-2 w-4 rounded-full transition-colors ${
                    val
                      ? isLight
                        ? "bg-[#0e0f12]"
                        : "bg-[#f5f5f7]"
                      : locked
                        ? isLight
                          ? "bg-[#0e0f12]/[0.1]"
                          : "bg-white/[0.1]"
                        : isLight
                          ? "bg-[#0e0f12]/30"
                          : "bg-white/30"
                  }`}
                />
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const idx = sockets[selectedSocket] ? selectedSocket : sockets.findIndex(Boolean);
              if (idx >= 0) routeSocket(idx);
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              isLight
                ? "border-[#0e0f12]/[0.14] bg-[#f5f6f8] text-[#0e0f12] hover:bg-[#e9ebf0]"
                : "border-white/[0.14] bg-white/[0.07] text-[#f5f5f7] hover:bg-white/[0.13]"
            }`}
          >
            <Radio className="size-3.5" strokeWidth={1.85} aria-hidden="true" />
            Test route
          </button>

          <button
            type="button"
            onClick={() => {
              const next = !proUnlocked;
              setProUnlocked(next);
              if (!next) {
                setSockets((s) => [s[0] ?? null, s[1] ?? null, s[2] ?? null, null, null]);
                if (selectedSocket >= 3) setSelectedSocket(0);
              }
              pushBusEvent(
                "tier:sockets-updated",
                next ? "Previewing Pro · 5 orbital sockets unlocked" : "Standard · 3 orbital sockets active",
              );
            }}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              proUnlocked
                ? isLight
                  ? "border-[#0e0f12] bg-[#0e0f12] text-white"
                  : "border-white/25 bg-[#f5f5f7] text-[#09090b]"
                : isLight
                  ? "border-[#0e0f12]/[0.12] bg-white text-[#22242c] hover:bg-[#f3f4f6]"
                  : "border-white/[0.12] bg-[#16161d] text-[#d1d1d6] hover:bg-white/[0.09]"
            }`}
          >
            <Lock className="size-3" strokeWidth={1.8} aria-hidden="true" />
            {proUnlocked ? "Pro sockets active" : "Preview Pro"}
          </button>
        </div>
      </div>

      {/* Main Spatial Studio Grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Interactive 5-Socket Orbital Constellation SVG (Gold preserved on graphic geometry) */}
        <div className={`relative flex flex-col overflow-hidden rounded-[16px] border p-4 lg:col-span-7 ${cardSurface}`}>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className={`font-medium ${textPrimary}`}>Orbital socket constellation</span>
            <span className={`font-mono text-[11px] ${textSubtle}`}>Click any node to inspect</span>
          </div>

          <div className="flex flex-1 items-center justify-center py-2">
            <svg
              viewBox="0 0 600 314"
              className="block h-auto w-full max-w-[680px] overflow-visible"
              role="group"
              aria-label="Interactive 5-socket Nexus spatial constellation"
            >
              {[96, 152, 208, 256].map((r, i) => (
                <path
                  key={r}
                  d={`M ${CONSTELLATION_CORE.x - r} ${CONSTELLATION_CORE.y} A ${r} ${r} 0 0 1 ${CONSTELLATION_CORE.x + r} ${CONSTELLATION_CORE.y}`}
                  fill="none"
                  stroke={
                    isLight
                      ? i === 1 || i === 2
                        ? "rgba(154,105,16,0.16)"
                        : "rgba(14,15,18,0.07)"
                      : i === 1 || i === 2
                        ? "rgba(240,181,74,0.14)"
                        : "rgba(255,255,255,0.06)"
                  }
                  strokeWidth="1"
                />
              ))}

              {NODE_COORDS.map((pt, idx) => {
                const modId = sockets[idx];
                const locked = idx >= maxSlots;
                const isSelected = selectedSocket === idx;
                const path = socketCurvePath(idx);
                const isPulsing = routingPulse?.socketIdx === idx;

                return (
                  <g key={`conduit-${idx}`}>
                    <path
                      d={path}
                      fill="none"
                      stroke={
                        modId
                          ? isSelected
                            ? "#f0b54a"
                            : isLight
                              ? "rgba(180,124,16,0.55)"
                              : "rgba(240,181,74,0.48)"
                          : locked
                            ? isLight
                              ? "rgba(14,15,18,0.12)"
                              : "rgba(255,255,255,0.1)"
                            : isLight
                              ? "rgba(180,124,16,0.28)"
                              : "rgba(240,181,74,0.28)"
                      }
                      strokeWidth={isSelected && modId ? 2 : modId ? 1.45 : 1}
                      strokeDasharray={modId ? undefined : "4 4"}
                    />

                    {modId && (isSelected || isPulsing) ? (
                      <circle
                        key={`pulse-${idx}-${routingPulse?.serial ?? 0}`}
                        r={isPulsing ? 4 : 2.8}
                        fill={isLight ? "#b47c10" : "#fff4d2"}
                      >
                        <animateMotion dur={isPulsing ? "1.1s" : "2.6s"} repeatCount="indefinite" path={path} />
                      </circle>
                    ) : null}

                    <g
                      onClick={() => setSelectedSocket(idx)}
                      role="button"
                      tabIndex={0}
                      aria-label={
                        modId
                          ? `Inspect ${NODE_CATALOG[modId]?.name} on Socket ${idx + 1}`
                          : locked
                            ? `Pro Socket ${idx + 1} (locked)`
                            : `Open Socket ${idx + 1}`
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedSocket(idx);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {isSelected ? (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="31"
                          fill="none"
                          stroke="#f0b54a"
                          strokeOpacity="0.55"
                          strokeWidth="1.2"
                          strokeDasharray="16 20"
                        />
                      ) : null}

                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="22"
                        fill={
                          isLight
                            ? modId
                              ? "#ffffff"
                              : "#f7f8fa"
                            : modId
                              ? "#15151c"
                              : "#0d0d12"
                        }
                        stroke={
                          modId
                            ? "#f0b54a"
                            : locked
                              ? isLight
                                ? "rgba(14,15,18,0.22)"
                                : "rgba(255,255,255,0.2)"
                              : isLight
                                ? "rgba(180,124,16,0.55)"
                                : "rgba(240,181,74,0.55)"
                        }
                        strokeWidth={isSelected ? 1.8 : 1.25}
                        strokeDasharray={!modId && !locked ? "3 3" : undefined}
                      />

                      <text
                        x={pt.x}
                        y={pt.y + 4.5}
                        textAnchor="middle"
                        fill={
                          modId
                            ? isLight
                              ? "#0e0f12"
                              : "#f5f5f7"
                            : locked
                              ? isLight
                                ? "#777a86"
                                : "#7c7c86"
                              : isLight
                                ? "#2c2e36"
                                : "#d1d1d6"
                        }
                        fontSize="13"
                        fontWeight="600"
                      >
                        {modId ? NODE_CATALOG[modId]?.monogram : locked ? "Pro" : "+"}
                      </text>

                      <text
                        x={pt.x}
                        y={pt.y - 31}
                        textAnchor="middle"
                        fill={isLight ? "#1b1d24" : "#e5e5ea"}
                        fontSize="13"
                        fontWeight={isSelected ? "600" : "500"}
                      >
                        {modId ? NODE_CATALOG[modId]?.name : locked ? `Socket ${idx + 1}` : "Open socket"}
                      </text>
                    </g>
                  </g>
                );
              })}

              {/* Central Singularity Core Nucleus */}
              <g>
                <circle
                  cx={CONSTELLATION_CORE.x}
                  cy={CONSTELLATION_CORE.y}
                  r="26"
                  fill="none"
                  stroke={isLight ? "rgba(180,124,16,0.26)" : "rgba(240,181,74,0.28)"}
                  strokeWidth="1"
                />
                <circle
                  cx={CONSTELLATION_CORE.x}
                  cy={CONSTELLATION_CORE.y}
                  r="16"
                  fill={isLight ? "#fff9eb" : "#1a150b"}
                  stroke="#f0b54a"
                  strokeWidth="1.5"
                />
                <circle cx={CONSTELLATION_CORE.x} cy={CONSTELLATION_CORE.y} r="5" fill="#f0b54a" />
                <text
                  x={CONSTELLATION_CORE.x}
                  y={CONSTELLATION_CORE.y + 35}
                  textAnchor="middle"
                  fill={isLight ? "#575b66" : "#a1a1a6"}
                  fontSize="12.5"
                  fontWeight="500"
                >
                  Singularity Core · nexusBus
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* Right: Precision Capability Inspector + Live nexusBus Event Ledger */}
        <div className="flex flex-col gap-3.5 lg:col-span-5">
          <div className={`rounded-[16px] border p-4 ${cardSurface}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`text-[11.5px] font-medium tabular-nums ${textMuted}`}>
                  Socket {selectedSocket + 1} of 5
                </p>
                <p className={`mt-0.5 text-[16px] font-semibold ${textPrimary}`}>
                  {selectedModule
                    ? selectedModule.name
                    : selectedLocked
                      ? "Pro orbital socket"
                      : "Open orbital socket"}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  selectedModule
                    ? isLight
                      ? "bg-[#0e0f12]/[0.07] text-[#0e0f12]"
                      : "bg-white/[0.1] text-[#f5f5f7]"
                    : isLight
                      ? "bg-[#f1f2f5] text-[#575b66]"
                      : "bg-white/[0.06] text-[#9d9da6]"
                }`}
              >
                {selectedModule ? "Mounted" : selectedLocked ? "Pro tier" : "Ready"}
              </span>
            </div>

            {selectedModule ? (
              <>
                <p className={`mt-2 text-[12.5px] leading-[1.52] ${textMuted}`}>{selectedModule.tagline}</p>

                <div className="mt-3">
                  <p className={`text-[11px] font-medium ${textSubtle}`}>Granted capabilities</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selectedModule.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${innerSurface} ${textPrimary}`}
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                  <p className={`mt-2 font-mono text-[11px] ${textSubtle}`}>{selectedModule.scope}</p>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => routeSocket(selectedSocket)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                      isLight
                        ? "bg-[#0e0f12] text-white hover:bg-[#23252c]"
                        : "bg-[#f5f5f7] text-[#09090b] hover:bg-white"
                    }`}
                  >
                    <Send className="size-3" strokeWidth={1.9} aria-hidden="true" />
                    Route signal
                  </button>
                  <button
                    type="button"
                    onClick={() => releaseSocket(selectedSocket)}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      isLight
                        ? "border-[#0e0f12]/12 bg-white text-[#22242c] hover:bg-[#f3f4f6]"
                        : "border-white/12 bg-white/[0.05] text-[#d1d1d6] hover:bg-white/[0.1]"
                    }`}
                  >
                    Release socket
                  </button>
                </div>
              </>
            ) : selectedLocked ? (
              <div className="mt-2.5 space-y-3">
                <p className={`text-[12.5px] leading-[1.52] ${textMuted}`}>
                  Pro unlocks 5 simultaneous orbital sockets for custom SDK v1 modules.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setProUnlocked(true);
                    pushBusEvent("tier:sockets-updated", "Previewing Pro · Sockets 4 & 5 unlocked");
                  }}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium ${
                    isLight
                      ? "bg-[#0e0f12] text-white hover:bg-[#23252c]"
                      : "bg-[#f5f5f7] text-[#09090b] hover:bg-white"
                  }`}
                >
                  Unlock in preview
                </button>
              </div>
            ) : (
              <div className="mt-2.5 space-y-3">
                <p className={`text-[12.5px] leading-[1.52] ${textMuted}`}>
                  Socket ready. Pick a module below to mount it with scoped permissions.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.values(NODE_CATALOG)
                    .filter((m) => !sockets.includes(m.id))
                    .slice(0, 3)
                    .map((mod) => (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => snapModule(mod.id, selectedSocket)}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors ${
                          isLight
                            ? "border-[#0e0f12]/16 bg-[#f5f6f8] text-[#0e0f12] hover:bg-[#e9ebf0]"
                            : "border-white/16 bg-white/[0.08] text-[#f5f5f7] hover:bg-white/[0.14]"
                        }`}
                      >
                        <Plus className="size-3" strokeWidth={2} aria-hidden="true" />
                        Snap {mod.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Live nexusBus Event Ledger */}
          <div className={`flex-1 rounded-[16px] border p-4 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-2 text-[12.5px] font-semibold ${textPrimary}`}>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isLight ? "bg-[#0e0f12]" : "bg-[#f5f5f7]"}`}
                  aria-hidden="true"
                />
                Live nexusBus stream
              </span>
              <span className={`font-mono text-[10.5px] ${textSubtle}`}>Scoped IPC</span>
            </div>

            <div className="mt-2.5 space-y-2">
              {busEvents.map((ev) => (
                <div
                  key={ev.id}
                  className={`rounded-[10px] border px-2.5 py-2 text-[11.5px] ${innerSurface}`}
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[10.5px]">
                    <span className={textSecondary}>{ev.topic}</span>
                    <span className={`tabular-nums ${textSubtle}`}>{ev.time}</span>
                  </div>
                  <p className={`mt-0.5 truncate ${textMuted}`}>{ev.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Module Dock */}
      <div className={`mt-4 rounded-[15px] border p-3 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
          <span className={`text-[12px] font-medium ${textPrimary}`}>Module dock</span>
          <span className={`text-[11.5px] ${textSubtle}`}>Click to snap or route</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Object.values(NODE_CATALOG).map((mod) => {
            const mountedIdx = sockets.findIndex((id) => id === mod.id);
            const isMounted = mountedIdx >= 0;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => snapModule(mod.id)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-[11px] border px-3 py-2 text-left transition-colors ${
                  isMounted
                    ? isLight
                      ? "border-[#0e0f12]/22 bg-[#f3f4f7] hover:bg-[#e8eaef]"
                      : "border-white/22 bg-white/[0.07] hover:bg-white/[0.11]"
                    : `${innerSurface} ${isLight ? "hover:border-[#0e0f12]/25" : "hover:border-white/25"}`
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold ${
                      isMounted
                        ? isLight
                          ? "border-[#0e0f12]/25 bg-white text-[#0e0f12]"
                          : "border-white/25 bg-[#121218] text-[#f5f5f7]"
                        : isLight
                          ? "border-[#0e0f12]/12 bg-white text-[#575b66]"
                          : "border-white/12 bg-[#101015] text-[#9d9da6]"
                    }`}
                  >
                    {mod.monogram}
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate text-[12px] font-medium ${textPrimary}`}>{mod.name}</p>
                    <p className={`text-[10.5px] tabular-nums ${isMounted ? textSecondary : textSubtle}`}>
                      {isMounted ? `Socket ${mountedIdx + 1}` : "Click to snap"}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Expansive Stage Section ────────────────────────────────────────── */

export function SingularityStage() {
  const [activeLayer, setActiveLayer] = useState<EcosystemLayer>("network");
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("dark");

  const activeMeta = LAYER_TABS.find((t) => t.id === activeLayer) ?? LAYER_TABS[0]!;
  const isLightPreview = previewTheme === "light";

  return (
    <section
      id="workspace"
      className="relative scroll-mt-24 overflow-hidden bg-[#111216] pt-14 pb-20 text-[#f5f5f7] sm:pt-18 sm:pb-24"
    >
      <div className="relative z-10 mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-10">
        {/* Clean Editorial Header + Braided Golden Signal Sculpture */}
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6">
            <h2 className="font-editorial text-[clamp(2.55rem,5.1vw,4.35rem)] leading-[1.01] font-normal tracking-[-0.038em] text-[#f5f5f7]">
              Build unified workflows
            </h2>
            <p className="mt-5 max-w-[52ch] text-[16.5px] leading-[1.6] text-[#b4b4bc] sm:text-[18px]">
              Nexus brings your personal assistant, your daily dashboard, and your everyday tools into one shared ecosystem. All working together
            </p>
          </div>

          <div className="lg:col-span-6">
            <EcosystemBridgeVisual activeLayer={activeLayer} onSelect={setActiveLayer} />
          </div>
        </div>

        {/* Separate Floating Pill Bar: Neural Network · Command · Nodes */}
        <div className="mt-9 mb-4 flex justify-center sm:mt-10 sm:mb-5">
          <div
            role="tablist"
            aria-label="Explore Nexus surfaces"
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/[0.11] bg-[#181920]/95 p-1.5 backdrop-blur-md"
          >
            {LAYER_TABS.map((tab) => {
              const active = activeLayer === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`workspace-panel-${tab.id}`}
                  onClick={() => setActiveLayer(tab.id)}
                  className={`min-h-[40px] cursor-pointer rounded-full px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 sm:px-6 sm:text-[14px] ${
                    active
                      ? "bg-[#f5f5f7] text-[#09090b] shadow-xs"
                      : "text-[#a1a1a6] hover:bg-white/[0.06] hover:text-[#f5f5f7]"
                  }`}
                >
                  {tab.title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Expansive Widescreen Observatory Frame */}
        <div
          id={`workspace-panel-${activeLayer}`}
          role="tabpanel"
          aria-label={`${activeMeta.title} interactive preview`}
          className="relative overflow-hidden rounded-[22px] border border-white/[0.11] bg-[#14151b] shadow-[0_32px_90px_-34px_rgba(0,0,0,0.68)]"
        >
          {/* Minimal Stage Top Bar: Active Description + Light/Dark Switcher Only */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${
              isLightPreview
                ? "border-[#0e0f12]/[0.09] bg-[#ffffff] text-[#0e0f12]"
                : "border-white/[0.08] bg-[#16171e] text-[#f5f5f7]"
            }`}
          >
            <p
              key={activeMeta.id}
              className={`lp-stage-panel text-[13px] leading-[1.45] sm:text-[13.5px] ${
                isLightPreview ? "text-[#4a4c55]" : "text-[#b8b8c0]"
              }`}
            >
              {activeMeta.description}
            </p>

            {/* Light / Dark Preview Theme Switcher */}
            <div
              className={`inline-flex shrink-0 items-center rounded-full border p-0.5 text-[11.5px] ${
                isLightPreview
                  ? "border-[#0e0f12]/[0.1] bg-[#f3f4f6]"
                  : "border-white/[0.1] bg-[#15151b]"
              }`}
            >
              <button
                type="button"
                onClick={() => setPreviewTheme("light")}
                aria-pressed={isLightPreview}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors ${
                  isLightPreview
                    ? "bg-white text-[#0e0f12] shadow-xs"
                    : "text-[#9d9da6] hover:text-white"
                }`}
              >
                <Sun className="size-3" strokeWidth={1.85} aria-hidden="true" />
                Light
              </button>
              <button
                type="button"
                onClick={() => setPreviewTheme("dark")}
                aria-pressed={!isLightPreview}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors ${
                  !isLightPreview
                    ? "bg-white/[0.14] text-white"
                    : "text-[#575b66] hover:text-[#0e0f12]"
                }`}
              >
                <Moon className="size-3" strokeWidth={1.85} aria-hidden="true" />
                Dark
              </button>
            </div>
          </div>

          {/* Active Live Surface Preview */}
          <div key={activeLayer} className="lp-stage-panel">
            {activeLayer === "network" ? <NeuralNetworkPreview theme={previewTheme} /> : null}
            {activeLayer === "command" ? <CommandPreview theme={previewTheme} /> : null}
            {activeLayer === "nodes" ? <NodesPreview theme={previewTheme} /> : null}
          </div>
        </div>

        {/* Quiet Minimal Footer Strip */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-[13px]">
          <span className="text-[#8e8e95]">Interactive preview</span>
          <div className="flex items-center gap-5">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-1.5 font-medium text-[#f5f5f7] transition-colors hover:text-white"
            >
              Join waitlist
              <ArrowRight className="size-3.5" strokeWidth={1.85} aria-hidden="true" />
            </a>
            <Link
              href="/signup"
              className="font-medium text-[#9d9da6] transition-colors hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
