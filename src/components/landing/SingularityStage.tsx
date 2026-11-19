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
import { NexusMark } from "./NexusLogo";
import {
  EcosystemBridgeVisual,
  EcosystemField,
  NeuralNetworkPreview,
  type EcosystemLayer,
} from "./WorkspaceVisuals";

type PreviewTheme = "dark" | "light";
type CommandTab = "overview" | "automations" | "connections";
type CommandPreset = "morning" | "deep-work";

/* ─── Layer Metadata (3 Switchable Menus) ─────────────────────────────────── */

const LAYER_TABS: Array<{
  id: EcosystemLayer;
  title: string;
  role: string;
  description: string;
  breadcrumb: string;
  chromeStatus: string;
}> = [
  {
    id: "network",
    title: "Neural Network",
    role: "Personal assistant",
    description:
      "Your ambient personal assistant—wired live across your schedule, inbox, and tools in an ephemeral session.",
    breadcrumb: "Nexus · Neural Network",
    chromeStatus: "Live WebGL canopy · 5 orbital sockets",
  },
  {
    id: "command",
    title: "Command",
    role: "Daily dashboard",
    description:
      "Your calm daily dashboard uniting calendar, Gmail, tasks, focus blocks, automations, and encrypted connections.",
    breadcrumb: "Nexus · Command",
    chromeStatus: "4×2 modular board · AES-256 vault",
  },
  {
    id: "nodes",
    title: "Nodes",
    role: "Modular extensions",
    description:
      "Snap isolated extensions into orbital sockets with plain-English capabilities and live cross-tool signal routing.",
    breadcrumb: "Nexus · Nodes",
    chromeStatus: "Spatial Studio · nexusBus v1",
  },
];

const LAYER_NOTES: Record<EcosystemLayer, Array<{ title: string; body: string }>> = {
  network: [
    {
      title: "Grounded in your real workspace",
      body: "Ask Nexus to brief your morning, trigger a focus block, or hand a Studio recording directly to Daily Brief.",
    },
    {
      title: "Ephemeral session memory",
      body: "Context stays alive while you work and vanishes cleanly when the tab closes—never stored or trained on.",
    },
    {
      title: "Visual orbital routing",
      body: "Watch signals travel from the Singularity Core straight into the exact modular socket handling your request.",
    },
  ],
  command: [
    {
      title: "One calm daily surface",
      body: "Calendar, Gmail, tasks, weather, and live telemetry sit on a single modular board without switching browser tabs.",
    },
    {
      title: "Visual automations, zero code",
      body: "Link incoming mail, focus timers, and Node events into deterministic conduits that run quietly in the background.",
    },
    {
      title: "Incremental encrypted connections",
      body: "Connect Google, GitHub, or fitness feeds only when you want them—tokens stay encrypted at rest with AES-256-GCM.",
    },
  ],
  nodes: [
    {
      title: "Capability-scoped isolation",
      body: "Every Node runs in its own sandbox and declares plain-English permissions before it can read or publish a single event.",
    },
    {
      title: "Shared event bus across tools",
      body: "Snapped modules publish structured signals over nexusBus so Neural Network and Command react the instant work finishes.",
    },
    {
      title: "Built on Open SDK v1",
      body: "Start with built-in Studio, Daily Brief, and Focus Guard sockets—or snap in custom tools built for your own craft.",
    },
  ],
};

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
      "Hi team, the shared workspace socket spec is ready for final review ahead of Friday's build. Let me know if the Command grid timing looks clean.",
      "Best,\nElena",
    ],
  },
  {
    id: "devon",
    sender: "Devon Patel",
    subject: "Studio Audio Routing",
    time: "Yesterday",
    body: [
      "Tested the multi-track capture export with cloud sync on Chrome and Safari. Both stem waveforms align cleanly on reload.",
      "Ready to wire the Daily Brief socket handoff next.",
    ],
  },
  {
    id: "github",
    sender: "GitHub",
    subject: "PR #48 merged to main",
    time: "Nov 16",
    body: [
      "Merged pull request #48: Expand Command calendar widget to a full 30-day interactive month view with incremental Google OAuth scopes.",
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
    action: "Focus Guard · Mute non-urgent alerts",
    topic: "command:focus-changed",
    enabled: true,
    lastRun: "14m ago",
  },
  {
    id: "auto-studio",
    name: "Route finished takes",
    trigger: "Studio · Take exported",
    action: "Daily Brief · Attach transcript summary",
    topic: "studio:take-routed",
    enabled: true,
    lastRun: "1h ago",
  },
  {
    id: "auto-receipt",
    name: "File billing receipts",
    trigger: "Gmail · Invoice detected",
    action: "Ledger · Append monthly entry",
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
    tagline: "Multi-track audio capture & instant take routing into your shared workspace.",
    capabilities: ["Audio & Media", "Shared Context", "Cloud Export"],
    scope: "content:studio.recording:read",
    topic: "studio:take-routed",
    routeMessage: "Published “Q4 Product Note — Take 3” → Daily Brief",
  },
  brief: {
    id: "brief",
    monogram: "DB",
    name: "Daily Brief",
    tagline: "Synthesizes schedule, unread mail, and active takes for Neural Network and Command.",
    capabilities: ["Calendar Read", "Shared Context", "Assistant Feed"],
    scope: "context:brief.digest:write",
    topic: "brief:digest-updated",
    routeMessage: "Compiled 3 priority items → Neural Network Core",
  },
  focus: {
    id: "focus",
    monogram: "FG",
    name: "Focus Guard",
    tagline: "Listens to Command deep-work timers and quiets distracting channels automatically.",
    capabilities: ["Focus State", "Notifications", "Automation Hook"],
    scope: "command:focus.session:subscribe",
    topic: "focus:shield-engaged",
    routeMessage: "Engaged 25m quiet shield ← Command timer",
  },
  capture: {
    id: "capture",
    monogram: "QC",
    name: "Quick Capture",
    tagline: "Zero-friction voice & markdown notes routed straight into your Command tasks.",
    capabilities: ["Tasks Write", "Voice Input", "Local Cache"],
    scope: "command:tasks.item:create",
    topic: "capture:note-queued",
    routeMessage: "Queued action item → Command Today Tasks",
  },
  ledger: {
    id: "ledger",
    monogram: "Lg",
    name: "Ledger",
    tagline: "Turns verified receipt emails into structured personal expense summaries.",
    capabilities: ["Mail Metadata", "Encrypted Vault", "CSV Export"],
    scope: "vault:ledger.entry:append",
    topic: "ledger:receipt-logged",
    routeMessage: "Logged verified cloud invoice → Encrypted Vault",
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

/* ─── Bespoke 1.5px Architectural Icons for the 3 Menus ───────────────────── */

function LayerGlyph({ layer, active }: { layer: EcosystemLayer; active: boolean }) {
  const stroke = active ? "#f0b54a" : "currentColor";
  if (layer === "network") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
        <circle cx="12" cy="14" r="3.2" stroke={stroke} strokeWidth="1.5" />
        <path d="M12 10.8 C12 7.5 12 6 12 4.5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M9.4 12 C7.2 10.2 5.8 8.4 4.8 6.4" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        <path d="M14.6 12 C16.8 10.2 18.2 8.4 19.2 6.4" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="12" cy="4" r="1.4" fill={stroke} />
        <circle cx="4.5" cy="6" r="1.4" fill={stroke} />
        <circle cx="19.5" cy="6" r="1.4" fill={stroke} />
        <path d="M4.5 18.5 Q12 15.2 19.5 18.5" stroke={stroke} strokeWidth="1.25" strokeOpacity="0.55" strokeLinecap="round" />
      </svg>
    );
  }
  if (layer === "command") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
        <rect x="3.5" y="4" width="7.5" height="9.5" rx="2" stroke={stroke} strokeWidth="1.5" />
        <rect x="13" y="4" width="7.5" height="6" rx="2" stroke={stroke} strokeWidth="1.5" />
        <rect x="13" y="12" width="7.5" height="8" rx="2" stroke={stroke} strokeWidth="1.5" />
        <rect x="3.5" y="15.5" width="7.5" height="4.5" rx="1.8" stroke={stroke} strokeWidth="1.5" strokeOpacity="0.65" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" aria-hidden="true">
      <circle cx="12" cy="18" r="2.2" fill={stroke} />
      <path d="M12 15.8 L6.2 9.4 M12 15.8 L12 6.8 M12 15.8 L17.8 9.4" stroke={stroke} strokeWidth="1.35" strokeOpacity="0.7" />
      <circle cx="5.5" cy="8.5" r="2.2" stroke={stroke} strokeWidth="1.45" />
      <circle cx="12" cy="5.2" r="2.2" stroke={stroke} strokeWidth="1.45" />
      <circle cx="18.5" cy="8.5" r="2.2" stroke={stroke} strokeWidth="1.45" />
    </svg>
  );
}

/* ─── Authentic Command Dashboard Preview ─────────────────────────────────── */

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
    : "border-white/[0.08] bg-[#101015]";
  const innerSurface = isLight ? "bg-[#f5f6f8] border-[#0e0f12]/[0.07]" : "bg-[#15151c] border-white/[0.07]";
  const textPrimary = isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]";
  const textMuted = isLight ? "text-[#575b66]" : "text-[#9d9da6]";
  const textSubtle = isLight ? "text-[#6c707c]" : "text-[#8a8a94]";
  const goldText = isLight ? "text-[#9a6910]" : "text-[#f0b54a]";

  return (
    <div
      className="min-h-[540px] w-full p-4 sm:min-h-[590px] sm:p-5 lg:p-6"
      style={{ background: isLight ? "#f6f7f9" : "#08080b" }}
    >
      {/* Authentic Command Header Bar (Greeting · Overview/Automations/Connections · Focus Pill · ⌘K) */}
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

        {/* Center Segmented Control: Overview | Automations | Connections */}
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
                  ? "border-[#b47c10]/45 bg-[#fef7e6] text-[#7c5308]"
                  : "border-[#f0b54a]/45 bg-[#f0b54a]/[0.14] text-[#ffd99a]"
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
                  : "border-[#f0b54a]/50 bg-[#f0b54a]/15 text-[#ffd99a]"
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

      {/* Inline ⌘K Command Palette Strip or Transient Execution Feedback */}
      {quickOpen ? (
        <div
          className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[13px] border px-3.5 py-2.5 text-[12px] ${
            isLight
              ? "border-[#b47c10]/35 bg-[#fffcf4] text-[#0e0f12]"
              : "border-[#f0b54a]/35 bg-[#14120c] text-[#f5f5f7]"
          }`}
        >
          <div className="flex items-center gap-2">
            <Search className={`size-3.5 ${goldText}`} strokeWidth={1.8} aria-hidden="true" />
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
                  ? "border-[#0e0f12]/12 bg-white hover:border-[#b47c10]/50"
                  : "border-white/12 bg-white/[0.05] hover:border-[#f0b54a]/50"
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
                  ? "border-[#0e0f12]/12 bg-white hover:border-[#b47c10]/50"
                  : "border-white/12 bg-white/[0.05] hover:border-[#f0b54a]/50"
              }`}
            >
              Inspect Automations
            </button>
            <button
              type="button"
              onClick={() =>
                runQuickCommand("Opened Encrypted Connections Vault", () => setSubTab("connections"))
              }
              className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                isLight
                  ? "border-[#0e0f12]/12 bg-white hover:border-[#b47c10]/50"
                  : "border-white/12 bg-white/[0.05] hover:border-[#f0b54a]/50"
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
              ? "border-[#b47c10]/30 bg-[#fef8ea] text-[#6d4907]"
              : "border-[#f0b54a]/30 bg-[#f0b54a]/10 text-[#ffd99a]"
          }`}
        >
          <Zap className="size-3.5 shrink-0" strokeWidth={1.9} aria-hidden="true" />
          <span>{quickNotice}</span>
        </div>
      ) : null}

      {/* ── Sub-view 1: Overview (4×2 Authentic Command Board) ── */}
      {subTab === "overview" ? (
        <div className="mt-4 grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Calendar Widget */}
          <div className={`rounded-[16px] border p-4 lg:col-span-4 ${cardSurface}`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className={`text-[14px] font-semibold ${textPrimary}`}>November</p>
              <p className={`truncate text-[11.5px] ${goldText}`}>
                {CALENDAR_EVENTS[selectedDay] ?? "No events scheduled"}
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
                          isSelected ? "bg-[#f0b54a]" : isLight ? "bg-[#b47c10]" : "bg-[#f0b54a]"
                        }`}
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2-Pane Interactive Gmail Widget */}
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
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0b54a]" aria-hidden="true" />
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

              <div className={`mt-3 flex items-center justify-between border-t pt-2.5 text-[11px] ${isLight ? "border-[#0e0f12]/[0.07]" : "border-white/[0.07]"} ${textSubtle}`}>
                <span className="inline-flex items-center gap-1">
                  <PenSquare className="size-3" strokeWidth={1.7} aria-hidden="true" />
                  Draft with Neural Network
                </span>
                <span>Read-only scope</span>
              </div>
            </div>
          </div>

          {/* Interactive Today Tasks Widget */}
          <div className={`flex flex-col justify-between rounded-[16px] border p-4 lg:col-span-3 ${cardSurface}`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[14px] font-semibold ${textPrimary}`}>Today</p>
                <span className={`text-[11.5px] font-medium tabular-nums ${goldText}`}>
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
                          ? "border-[#f0b54a] bg-[#f0b54a] text-[#09090b]"
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
                className="h-full rounded-full bg-[#f0b54a] transition-all duration-300"
                style={{ width: `${(completedCount / tasks.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Bottom Row Left: Weather Tile */}
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
              <CloudSun className={`size-6 ${goldText}`} strokeWidth={1.6} aria-hidden="true" />
            </div>

            <div className="mt-4 grid grid-cols-5 gap-2">
              {HOURLY_WEATHER.map((slot) => (
                <div
                  key={slot.label}
                  className={`flex flex-col items-center gap-1 rounded-[10px] border py-2 text-center ${innerSurface}`}
                >
                  <span className={`text-[10.5px] ${textSubtle}`}>{slot.label}</span>
                  {slot.icon === "partly" ? (
                    <CloudSun className={`size-3.5 ${goldText}`} strokeWidth={1.7} aria-hidden="true" />
                  ) : (
                    <Cloud className={`size-3.5 ${textMuted}`} strokeWidth={1.7} aria-hidden="true" />
                  )}
                  <span className={`text-[12px] font-medium tabular-nums ${textPrimary}`}>{slot.temp}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Row Right: Formula 1 Live Telemetry Tile */}
          <div className={`rounded-[16px] border p-4 lg:col-span-7 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <p className={`text-[14px] font-semibold ${textPrimary}`}>Formula 1</p>
              <span className={`text-[11.5px] ${textMuted}`}>Las Vegas · Qualifying timing</span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[12px] tabular-nums">
                <thead>
                  <tr className={`border-b text-[10.5px] ${isLight ? "border-[#0e0f12]/[0.08]" : "border-white/[0.08]"} ${textSubtle}`}>
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
                      <td className={`py-2 ${row.fastest ? goldText : textMuted}`}>{row.sector}</td>
                      <td className={`py-2 text-right font-medium ${textPrimary}`}>{row.lap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Sub-view 2: Automations (Visual Signal Conduit Recipes) ── */}
      {subTab === "automations" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className={`text-[13px] ${textMuted}`}>
              Deterministic cross-ecosystem workflows linking Command, Neural Network, and Nodes.
            </p>
            <span className={`font-mono text-[11.5px] tabular-nums ${goldText}`}>
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
                    pulsing ? "border-[#f0b54a]/60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-[14px] font-semibold ${textPrimary}`}>{auto.name}</p>
                      <span className={`font-mono text-[11px] ${goldText}`}>{auto.topic}</span>
                    </div>

                    {/* Visual Trigger -> Signal Conduit -> Action schematic */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px]">
                      <span className={`rounded-[9px] border px-2.5 py-1 font-medium ${innerSurface} ${textPrimary}`}>
                        {auto.trigger}
                      </span>
                      <span className="inline-flex items-center gap-1" aria-hidden="true">
                        <span
                          className={`h-[1.5px] w-7 transition-colors ${
                            pulsing
                              ? "bg-[#ffd99a]"
                              : auto.enabled
                                ? "bg-[#f0b54a]/70"
                                : isLight
                                  ? "bg-[#0e0f12]/20"
                                  : "bg-white/20"
                          }`}
                        />
                        <ArrowRight
                          className={`size-3.5 ${auto.enabled ? goldText : textSubtle}`}
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
                          ? "border-[#0e0f12]/[0.12] bg-white text-[#0e0f12] hover:border-[#b47c10]/60"
                          : "border-white/[0.12] bg-[#16161e] text-[#f5f5f7] hover:border-[#f0b54a]/55"
                      }`}
                    >
                      <Zap className={`size-3.5 ${goldText}`} strokeWidth={1.8} aria-hidden="true" />
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
                          ? "bg-[#f0b54a]"
                          : isLight
                            ? "bg-[#d6d8df]"
                            : "bg-white/[0.15]"
                      }`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${
                          auto.enabled ? "translate-x-6" : "translate-x-1"
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

      {/* ── Sub-view 3: Connections (Encrypted AES-256-GCM Connector Vault) ── */}
      {subTab === "connections" ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <span className={`inline-flex items-center gap-2 text-[13px] ${textMuted}`}>
              <ShieldCheck className={`size-4 ${goldText}`} strokeWidth={1.75} aria-hidden="true" />
              Incremental OAuth scopes encrypted at rest with AES-256-GCM.
            </span>
            <span className={`text-[12px] font-medium tabular-nums ${goldText}`}>
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
                            ? "bg-[#fef7e6] text-[#7c5308]"
                            : "bg-[#f0b54a]/14 text-[#ffd99a]"
                          : isLight
                            ? "bg-[#f1f2f5] text-[#5c606a]"
                            : "bg-white/[0.06] text-[#8e8e95]"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${conn.connected ? "bg-[#f0b54a]" : "bg-current opacity-40"}`}
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
                          : "border-[#f0b54a]/45 bg-[#f0b54a]/16 text-[#ffd99a] hover:bg-[#f0b54a]/24"
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

/* ─── Authentic Spatial Nodes Studio Preview ──────────────────────────────── */

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
      // Unlock pro preview automatically if all 3 free slots are occupied
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
    : "border-white/[0.08] bg-[#101015]";
  const innerSurface = isLight ? "bg-[#f5f6f8] border-[#0e0f12]/[0.07]" : "bg-[#15151c] border-white/[0.07]";
  const textPrimary = isLight ? "text-[#0e0f12]" : "text-[#f5f5f7]";
  const textMuted = isLight ? "text-[#575b66]" : "text-[#9d9da6]";
  const textSubtle = isLight ? "text-[#6c707c]" : "text-[#8a8a94]";
  const goldText = isLight ? "text-[#9a6910]" : "text-[#f0b54a]";

  return (
    <div
      className="min-h-[540px] w-full p-4 sm:min-h-[590px] sm:p-5 lg:p-6"
      style={{ background: isLight ? "#f6f7f9" : "#08080b" }}
    >
      {/* Top Studio Header Bar (Occupancy Meter · Test Route · Preview Pro) */}
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

          {/* 5-pip occupancy meter */}
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {sockets.map((val, idx) => {
              const locked = idx >= maxSlots;
              return (
                <span
                  key={idx}
                  className={`h-2 w-4 rounded-full transition-colors ${
                    val
                      ? "bg-[#f0b54a]"
                      : locked
                        ? isLight
                          ? "bg-[#0e0f12]/[0.1]"
                          : "bg-white/[0.1]"
                        : isLight
                          ? "bg-[#b47c10]/30"
                          : "bg-[#f0b54a]/30"
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
                ? "border-[#b47c10]/40 bg-[#fef7e6] text-[#7c5308] hover:bg-[#fceec9]"
                : "border-[#f0b54a]/45 bg-[#f0b54a]/14 text-[#ffd99a] hover:bg-[#f0b54a]/22"
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
                  : "border-white/25 bg-white/[0.15] text-white"
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

      {/* Main Spatial Studio Grid: Orbital Constellation + Precision Capability Inspector */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Interactive 5-Socket Orbital Constellation SVG */}
        <div className={`relative flex flex-col overflow-hidden rounded-[16px] border p-4 lg:col-span-7 ${cardSurface}`}>
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className={`font-medium ${textPrimary}`}>Orbital socket constellation</span>
            <span className={`font-mono text-[11px] ${textSubtle}`}>Click any node to inspect or route</span>
          </div>

          <div className="flex flex-1 items-center justify-center py-2">
          <svg
            viewBox="0 0 600 314"
            className="block h-auto w-full max-w-[680px] overflow-visible"
            role="group"
            aria-label="Interactive 5-socket Nexus spatial constellation"
          >
            {/* Concentric range arcs centered on the Core */}
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

            {/* 5 Curved Optical Conduits from Core to Orbital Sockets */}
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

                  {/* Animated Signal Photon gliding cleanly along occupied selected or pulsed conduit */}
                  {modId && (isSelected || isPulsing) ? (
                    <circle
                      key={`pulse-${idx}-${routingPulse?.serial ?? 0}`}
                      r={isPulsing ? 4 : 2.8}
                      fill={isLight ? "#b47c10" : "#fff4d2"}
                    >
                      <animateMotion dur={isPulsing ? "1.1s" : "2.6s"} repeatCount="indefinite" path={path} />
                    </circle>
                  ) : null}

                  {/* Clickable Socket Node Reticle */}
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
                            ? "#6d4907"
                            : "#fff5d8"
                          : locked
                            ? isLight
                              ? "#777a86"
                              : "#7c7c86"
                            : isLight
                              ? "#9a6910"
                              : "#ffd99a"
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
          {/* Socket Inspector Card */}
          <div className={`rounded-[16px] border p-4 ${cardSurface}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`text-[11.5px] font-medium tabular-nums ${goldText}`}>
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
                      ? "bg-[#fef7e6] text-[#7c5308]"
                      : "bg-[#f0b54a]/15 text-[#ffd99a]"
                    : isLight
                      ? "bg-[#f1f2f5] text-[#575b66]"
                      : "bg-white/[0.07] text-[#9d9da6]"
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
                  Pro unlocks 5 simultaneous orbital sockets so Quick Capture, Ledger, and custom SDK v1 modules can run side by side.
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
                      : "bg-[#f0b54a] text-[#09090b] hover:bg-[#f5c469]"
                  }`}
                >
                  Unlock in preview
                </button>
              </div>
            ) : (
              <div className="mt-2.5 space-y-3">
                <p className={`text-[12.5px] leading-[1.52] ${textMuted}`}>
                  This orbital socket is ready. Pick any module below to snap it in with scoped permissions.
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
                            ? "border-[#b47c10]/40 bg-[#fef7e6] text-[#7c5308] hover:bg-[#fceec9]"
                            : "border-[#f0b54a]/45 bg-[#f0b54a]/14 text-[#ffd99a] hover:bg-[#f0b54a]/22"
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
                <span className="h-1.5 w-1.5 rounded-full bg-[#f0b54a]" aria-hidden="true" />
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
                    <span className={goldText}>{ev.topic}</span>
                    <span className={`tabular-nums ${textSubtle}`}>{ev.time}</span>
                  </div>
                  <p className={`mt-0.5 truncate ${textMuted}`}>{ev.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Module Dock (mirrors NodesView bottom catalog deck) */}
      <div className={`mt-4 rounded-[15px] border p-3 ${cardSurface}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
          <span className={`text-[12px] font-medium ${textPrimary}`}>Module dock</span>
          <span className={`text-[11.5px] ${textSubtle}`}>
            Built-in tools & Open SDK v1 extensions — click to snap or route
          </span>
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
                      ? "border-[#b47c10]/35 bg-[#fef9ed] hover:bg-[#fcf1d4]"
                      : "border-[#f0b54a]/35 bg-[#f0b54a]/[0.09] hover:bg-[#f0b54a]/[0.15]"
                    : `${innerSurface} hover:border-[#f0b54a]/40`
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold ${
                      isMounted
                        ? isLight
                          ? "border-[#b47c10]/45 bg-white text-[#7c5308]"
                          : "border-[#f0b54a]/50 bg-[#14120c] text-[#ffd99a]"
                        : isLight
                          ? "border-[#0e0f12]/12 bg-white text-[#575b66]"
                          : "border-white/12 bg-[#101015] text-[#9d9da6]"
                    }`}
                  >
                    {mod.monogram}
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate text-[12px] font-medium ${textPrimary}`}>{mod.name}</p>
                    <p className={`text-[10.5px] tabular-nums ${isMounted ? goldText : textSubtle}`}>
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
  const notes = LAYER_NOTES[activeLayer];
  const isLightPreview = previewTheme === "light";

  return (
    <section
      id="workspace"
      className="relative scroll-mt-24 overflow-hidden bg-[#000000] pt-14 pb-24 text-[#f5f5f7] sm:pt-20 sm:pb-32"
    >
      {/* Ground-up astronomical observatory backdrop & active signal conduits */}
      <EcosystemField activeLayer={activeLayer} />

      <div className="relative z-10 mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-10">
        {/* Expansive Asymmetric Editorial Header + Live Shared Ecosystem Schematic */}
        <div className="grid grid-cols-1 items-end gap-8 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <h2 className="font-editorial text-[clamp(2.55rem,5.2vw,4.4rem)] leading-[1.01] font-normal tracking-[-0.038em] text-[#f5f5f7]">
              Build unified workflows
            </h2>
            <p className="mt-5 max-w-[56ch] text-[16.5px] leading-[1.6] text-[#b4b4bc] sm:text-[18px]">
              Nexus brings your personal assistant, your daily dashboard, and your everyday tools into one shared ecosystem. All working together
            </p>
          </div>

          <div className="lg:col-span-5">
            <EcosystemBridgeVisual activeLayer={activeLayer} onSelect={setActiveLayer} />
          </div>
        </div>

        {/* Expansive 3-Menu Architectural Selector Rail */}
        <div
          role="tablist"
          aria-label="Explore Nexus surfaces"
          className="mt-10 grid grid-cols-1 overflow-hidden rounded-t-[20px] border border-b-0 border-white/[0.1] bg-[#07070a]/95 md:mt-12 md:grid-cols-3"
        >
          {LAYER_TABS.map((tab, index) => {
            const active = activeLayer === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`workspace-panel-${tab.id}`}
                onClick={() => setActiveLayer(tab.id)}
                className={`group relative flex cursor-pointer flex-col gap-2 px-5 py-5 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#f0b54a] sm:px-6 sm:py-5 ${
                  index > 0 ? "border-t border-white/[0.08] md:border-t-0 md:border-l" : ""
                } ${
                  active
                    ? "bg-[#0e0e13]"
                    : "bg-transparent hover:bg-white/[0.025]"
                }`}
              >
                {/* 1.5px Singularity Gold active edge bar */}
                <span
                  className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] transition-opacity duration-300 ${
                    active
                      ? "bg-gradient-to-r from-[#f0b54a]/40 via-[#f0b54a] to-[#f0b54a]/40 opacity-100"
                      : "opacity-0"
                  }`}
                  aria-hidden="true"
                />

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={active ? "text-[#f0b54a]" : "text-[#8e8e95] group-hover:text-[#c9c9d0]"}>
                      <LayerGlyph layer={tab.id} active={active} />
                    </span>
                    <span
                      className={`text-[16px] font-semibold tracking-[-0.015em] transition-colors ${
                        active ? "text-[#f5f5f7]" : "text-[#b8b8c0] group-hover:text-[#f5f5f7]"
                      }`}
                    >
                      {tab.title}
                    </span>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium transition-colors ${
                      active
                        ? "bg-[#f0b54a]/[0.14] text-[#ffd99a]"
                        : "bg-white/[0.05] text-[#8e8e95]"
                    }`}
                  >
                    {tab.role}
                  </span>
                </div>

                <p
                  className={`text-[13.5px] leading-[1.52] transition-colors ${
                    active ? "text-[#c4c4cc]" : "text-[#8a8a93] group-hover:text-[#a8a8b2]"
                  }`}
                >
                  {tab.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Expansive Widescreen Observatory Frame bonded directly beneath the 3-menu rail */}
        <div
          id={`workspace-panel-${activeLayer}`}
          role="tabpanel"
          aria-label={`${activeMeta.title} interactive preview`}
          className="relative overflow-hidden rounded-b-[22px] border border-white/[0.11] bg-[#0a0a0e] shadow-[0_32px_90px_-34px_rgba(0,0,0,0.92)]"
        >
          {/* Unified Window Chrome with Nexus Mark, Live Breadcrumb & Working Light/Dark Switcher */}
          <div
            className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5 ${
              isLightPreview
                ? "border-[#0e0f12]/[0.09] bg-[#ffffff] text-[#0e0f12]"
                : "border-white/[0.08] bg-[#0c0c10] text-[#f5f5f7]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isLightPreview ? "bg-[#0e0f12]/18" : "bg-white/18"
                  }`}
                />
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isLightPreview ? "bg-[#0e0f12]/18" : "bg-white/18"
                  }`}
                />
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isLightPreview ? "bg-[#0e0f12]/18" : "bg-white/18"
                  }`}
                />
              </div>

              <span
                className={`h-3.5 w-[1px] ${isLightPreview ? "bg-[#0e0f12]/12" : "bg-white/12"}`}
                aria-hidden="true"
              />

              <div className="flex items-center gap-2">
                <NexusMark className="h-4 w-4 shrink-0" />
                <span className="text-[12.5px] font-medium">{activeMeta.breadcrumb}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`hidden items-center gap-2 text-[11.5px] sm:inline-flex ${
                  isLightPreview ? "text-[#575b66]" : "text-[#9d9da6]"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#f0b54a]" aria-hidden="true" />
                {activeMeta.chromeStatus}
              </span>

              {/* Light / Dark Preview Theme Switcher */}
              <div
                className={`inline-flex items-center rounded-full border p-0.5 text-[11.5px] ${
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
          </div>

          {/* Active Live Surface Preview */}
          <div key={activeLayer} className="lp-stage-panel">
            {activeLayer === "network" ? <NeuralNetworkPreview theme={previewTheme} /> : null}
            {activeLayer === "command" ? <CommandPreview theme={previewTheme} /> : null}
            {activeLayer === "nodes" ? <NodesPreview theme={previewTheme} /> : null}
          </div>
        </div>

        {/* Hairline-Divided Swiss Architectural Ledger (Adapts per Active Menu) */}
        <div className="mt-8 grid grid-cols-1 gap-6 border-t border-white/[0.09] pt-7 md:grid-cols-3 md:gap-8">
          {notes.map((note) => (
            <div key={note.title} className="space-y-1.5">
              <h3 className="text-[14.5px] font-semibold tracking-[-0.01em] text-[#f5f5f7]">
                {note.title}
              </h3>
              <p className="text-[13.5px] leading-[1.58] text-[#9d9da6]">{note.body}</p>
            </div>
          ))}
        </div>

        {/* Quiet Footer Action Strip */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-6 text-[13px]">
          <span className="text-[#9d9da6]">
            Interactive preview using sample data — switch between Neural Network, Command, and Nodes above.
          </span>
          <div className="flex items-center gap-5">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-1.5 font-medium text-[#ffd99a] transition-colors hover:text-white"
            >
              Join waitlist
              <ArrowRight className="size-3.5" strokeWidth={1.85} aria-hidden="true" />
            </a>
            <Link
              href="/signup"
              className="font-medium text-[#b8b8c0] transition-colors hover:text-white"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
