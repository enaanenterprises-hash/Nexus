"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Play, RefreshCw, Search, Square, Timer, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FocusSession } from "@/lib/command/automation/types";
import type { CommandBoardPreset } from "@/lib/command/presets";
import { getConnector } from "@/lib/connectors/catalog";
import { AutomationsView } from "./AutomationsView";
import { CommandQuickBar } from "./CommandQuickBar";
import { ConnectionsView } from "./ConnectionsView";
import { relative } from "./format";
import { OverviewView } from "./OverviewView";
import { useNow } from "./parts";
import { useCommand, type CommandController } from "./use-command";

export type CommandTab = "overview" | "automations" | "connections";

const TABS: { id: CommandTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "automations", label: "Automations" },
  { id: "connections", label: "Connections" },
];

const GREETING_STORAGE_KEY = "nexus:cmd-greeting-idx.v1";

function timeOfDayGreeting(name: string, hour: number): string {
  if (hour >= 5 && hour < 12) return `Good morning, ${name}`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${name}`;
  if (hour >= 17 && hour < 22) return `Good evening, ${name}`;
  return `Late night mode, ${name}`;
}

function buildGreetings(name: string, hour: number): string[] {
  return [
    timeOfDayGreeting(name, hour),
    `Welcome back, ${name}`,
    `Ready when you are, ${name}`,
    `Your desk is set, ${name}`,
    `Here's your pulse, ${name}`,
    `All systems steady, ${name}`,
    `Sharp focus ahead, ${name}`,
  ];
}

const noopSubscribe = () => () => {};
const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

type Props = {
  /** Viewer's display/first name shown in rotating Command greetings. */
  userName?: string | null;
  /** Whether Command is currently visible (guards global ⌘K listener). */
  visible?: boolean;
  /** Incremented by Dashboard each time Command is opened so greetings cycle reliably. */
  openCount?: number;
  /** Set by the dashboard after an OAuth round trip or deep-link (e.g. `{ tab: "overview", widget: "storage", itemId }`). */
  request: {
    tab: CommandTab;
    service: string | null;
    notice: string | null;
    widget?: string | null;
    itemId?: string | null;
    serial: number;
  } | null;
  onOpenCinemaWithVaultItem?: (itemId: string) => void;
  onOpenStudioWithVaultItem?: (itemId: string) => void;
  onClose: () => void;
};

/** Nexus Command: curated modular cockpit, live focus telemetry, deterministic automations, and encrypted connections. */
export function CommandView({
  userName,
  visible = true,
  openCount = 0,
  request,
  onOpenCinemaWithVaultItem,
  onOpenStudioWithVaultItem,
  onClose,
}: Props) {
  const command = useCommand();
  const [tab, setTab] = useState<CommandTab>("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const [quickBarOpen, setQuickBarOpen] = useState(false);
  const [expandRequest, setExpandRequest] = useState<{
    widgetId: string;
    itemId?: string | null;
    serial: number;
  } | null>(null);
  const [connectionFocusId, setConnectionFocusId] = useState<string | null>(null);
  const [greetingIndex, setGreetingIndex] = useState(0);
  const lastOpenCountRef = useRef<number | null>(null);
  const date = useSyncExternalStore(noopSubscribe, todayLabel, () => "");
  const now = useNow(30_000);
  const state = command.state;
  const lastSync = state?.connections.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;

  const displayName = userName?.trim() || "there";
  const greetings = buildGreetings(displayName, new Date(now).getHours());
  const activeGreeting = greetings[greetingIndex % greetings.length] ?? greetings[0]!;

  useEffect(() => {
    if (lastOpenCountRef.current === openCount) return;
    lastOpenCountRef.current = openCount;
    let next = 0;
    try {
      const raw = window.localStorage.getItem(GREETING_STORAGE_KEY);
      const prev = raw !== null ? Number.parseInt(raw, 10) : -1;
      next = Number.isFinite(prev) ? (prev + 1) % greetings.length : 0;
      window.localStorage.setItem(GREETING_STORAGE_KEY, String(next));
    } catch {
      next = Math.abs(openCount) % greetings.length;
    }
    const frame = window.requestAnimationFrame(() => setGreetingIndex(next));
    return () => window.cancelAnimationFrame(frame);
  }, [openCount, greetings.length]);

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickBarOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible]);

  const [handled, setHandled] = useState<number | null>(null);
  if (request && request.serial !== handled) {
    setHandled(request.serial);
    setTab(request.tab);
    setNotice(request.notice);
    setConnectionFocusId(request.service ?? null);
    if (request.widget) {
      setExpandRequest((prev) => ({
        widgetId: request.widget!,
        itemId: request.itemId ?? null,
        serial: (prev?.serial ?? 0) + 1,
      }));
    }
  }

  const handleApplyPreset = useCallback(
    async (preset: CommandBoardPreset) => {
      const err = await command.setOverview([...preset.widgets]);
      setNotice(err ?? `Applied “${preset.name}” layout.`);
    },
    [command],
  );

  const handleStartQuickFocus = useCallback(
    async (minutes = 25, title = "Deep work") => {
      const err = await command.startFocus({ title, minutes, targetItemId: null });
      setNotice(err ?? `Started ${minutes}-minute focus session.`);
    },
    [command],
  );

  const enabledAutomations = state?.recipes.filter((r) => r.enabled).length ?? 0;

  return (
    <section aria-label="Command" className="cmd-screen flex h-full min-h-0 flex-col">
      <header className="cmd-header grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 py-2.5 pr-3 pl-[64px] sm:pr-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-y-0 md:py-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2
            suppressHydrationWarning
            className="font-editorial truncate text-[1.12rem] leading-none font-normal tracking-[-0.018em] text-foreground sm:text-[1.22rem]"
          >
            {activeGreeting}
          </h2>
          <span
            suppressHydrationWarning
            className="hidden shrink-0 text-[11.5px] font-medium text-muted-foreground xl:inline"
          >
            {date || "Today"}
          </span>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as CommandTab)}
          className="col-span-2 row-start-2 -ml-[48px] justify-self-center md:col-span-1 md:col-start-2 md:row-start-1 md:ml-0"
        >
          <TabsList
            aria-label="Command views"
            className="h-8 gap-0.5 rounded-full border border-border/80 bg-card/80 p-0.5 shadow-2xs"
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-7 gap-1.5 rounded-full px-3 text-[12px] font-medium text-muted-foreground transition-all data-[active]:bg-foreground data-[active]:text-background data-[active]:shadow-xs"
              >
                <span>{t.label}</span>
                {t.id === "automations" && enabledAutomations > 0 ? (
                  <span className="rounded-full bg-current/15 px-1.5 py-px text-[10px] leading-none tabular-nums">
                    {enabledAutomations}
                  </span>
                ) : null}
                {t.id === "connections" && state?.connections.length ? (
                  <span className="rounded-full bg-current/15 px-1.5 py-px text-[10px] leading-none tabular-nums">
                    {state.connections.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-end gap-1.5 justify-self-end">
          {state ? (
            <FocusSessionPill
              command={command}
              focus={state.focus}
              focusRuleCount={state.recipes.filter((r) => r.enabled && r.trigger.type === "focus.started").length}
              onNotify={setNotice}
            />
          ) : null}

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setQuickBarOpen(true)}
                  className="cmd-kbd-chip max-sm:px-2"
                  aria-label="Open Command Spotlight (⌘K)"
                >
                  <Search className="size-3.5" />
                  <span className="hidden lg:inline">Quick jump</span>
                  <kbd className="cmd-kbd-key hidden sm:inline">⌘K</kbd>
                </button>
              }
            />
            <TooltipContent side="bottom">Command Spotlight (⌘K)</TooltipContent>
          </Tooltip>

          {state?.connections.length ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-8 gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
                    onClick={() => void command.sync()}
                    disabled={command.syncing}
                  >
                    <RefreshCw className={`size-3.5 ${command.syncing ? "animate-spin" : ""}`} />
                    <span className="hidden xl:inline tabular-nums">
                      {command.syncing ? "Syncing" : lastSync ? relative(lastSync, now) : "Sync"}
                    </span>
                  </Button>
                }
              />
              <TooltipContent side="bottom">Refresh every connected service</TooltipContent>
            </Tooltip>
          ) : null}

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onClose}
                  aria-label="Close Command"
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Back to the network</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {notice ? (
        <div className="px-4 pt-3 sm:px-6">
          <Alert role="status" className="rounded-xl border-border/80 bg-card/85 py-2.5">
            <AlertDescription className="text-[13px] text-foreground">{notice}</AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setNotice(null)}
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </Button>
            </AlertAction>
          </Alert>
        </div>
      ) : null}

      {state && command.error ? (
        <div className="px-4 pt-3 sm:px-6">
          <Alert variant="destructive" role="status" className="rounded-xl py-2.5">
            <AlertDescription className="text-[13px]">
              Could not refresh: {command.error}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {state?.errors.length ? (
        <div className="px-4 pt-3 sm:px-6">
          <Alert variant="destructive" role="status" className="rounded-xl py-2.5">
            <AlertDescription className="text-[13px]">
              {state.errors
                .map((e) => `${getConnector(e.connectorId)?.name ?? e.connectorId}: ${e.message}`)
                .join(" · ")}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className={`min-h-0 flex-1 ${tab === "overview" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {!state ? (
          command.error ? (
            <p className="cmd-empty px-8 pt-10">{command.error}</p>
          ) : (
            <div className="px-8 pt-10" aria-busy="true">
              <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <span className="state-dot state-dot--thinking" />
                Loading Command
              </p>
            </div>
          )
        ) : tab === "overview" ? (
          <OverviewView
            command={command}
            expandRequest={expandRequest}
            onApplyPreset={(preset) => void handleApplyPreset(preset)}
            onConnections={(connectorId) => {
              if (connectorId) setConnectionFocusId(connectorId);
              setTab("connections");
            }}
            onOpenCinemaWithVaultItem={onOpenCinemaWithVaultItem}
            onOpenStudioWithVaultItem={onOpenStudioWithVaultItem}
          />
        ) : tab === "automations" ? (
          <AutomationsView
            command={command}
            onConnections={() => setTab("connections")}
            onStartQuickFocus={() => void handleStartQuickFocus(25, "Deep work")}
          />
        ) : (
          <ConnectionsView
            key={connectionFocusId ?? "all"}
            command={command}
            focusId={connectionFocusId ?? request?.service ?? null}
          />
        )}
      </div>

      <CommandQuickBar
        open={quickBarOpen}
        command={command}
        onClose={() => setQuickBarOpen(false)}
        onSelectTab={setTab}
        onExpandWidget={(widgetId) =>
          setExpandRequest((prev) => ({ widgetId, serial: (prev?.serial ?? 0) + 1 }))
        }
        onApplyPreset={(preset) => void handleApplyPreset(preset)}
        onNotify={setNotice}
      />
    </section>
  );
}

function FocusSessionPill({
  command,
  focus,
  focusRuleCount,
  onNotify,
}: {
  command: CommandController;
  focus: FocusSession | null;
  focusRuleCount: number;
  onNotify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("Deep work");
  const [minutes, setMinutes] = useState<number>(25);
  const busy = command.pending === "focus";

  if (focus) {
    return (
      <ActiveFocusBadge
        focus={focus}
        busy={busy}
        onEnd={async () => {
          const err = await command.endFocus();
          onNotify(err ?? `Ended “${focus.title}”.`);
        }}
      />
    );
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const cleanTitle = title.trim() || "Deep work";
    setOpen(false);
    const err = await command.startFocus({
      title: cleanTitle,
      minutes,
      targetItemId: null,
    });
    onNotify(err ?? `Started ${minutes}-minute “${cleanTitle}” session.`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="cmd-focus-pill"
            aria-label="Start a focus session"
          >
            <Timer className="size-3.5 text-[color:var(--land-gold)]" />
            <span className="hidden sm:inline">Focus</span>
          </button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 rounded-2xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-2xl ring-0 backdrop-blur-2xl"
      >
        <form onSubmit={start} className="space-y-3.5">
          <div>
            <p className="font-editorial text-[1.08rem] leading-tight text-foreground">Focus session</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {focusRuleCount > 0
                ? `Runs ${focusRuleCount} active focus automation${focusRuleCount === 1 ? "" : "s"} automatically.`
                : "Set an intentional work block in Command."}
            </p>
          </div>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you focusing on?"
            className="cmd-field h-9 w-full rounded-xl px-3 text-[13px]"
          />

          <div className="grid grid-cols-3 gap-1.5">
            {[25, 45, 60].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMinutes(m)}
                className={`h-8 rounded-xl border text-[12px] font-medium tabular-nums transition-colors ${
                  minutes === m
                    ? "border-[color:var(--land-gold)] bg-[color:var(--land-gold)]/15 text-foreground"
                    : "border-border bg-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {m} min
              </button>
            ))}
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="h-9 w-full gap-1.5 rounded-full bg-foreground text-[12.5px] font-medium text-background hover:bg-foreground/90"
          >
            <Play className="size-3.5" />
            <span>{busy ? "Starting…" : `Start ${minutes}m focus`}</span>
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function ActiveFocusBadge({
  focus,
  busy,
  onEnd,
}: {
  focus: FocusSession;
  busy: boolean;
  onEnd: () => void;
}) {
  const now = useNow(1_000);
  const startMs = new Date(focus.startedAt).getTime();
  const endMs = new Date(focus.endsAt).getTime();
  const totalMs = Math.max(1_000, endMs - startMs);
  const remainingMs = Math.max(0, endMs - now);
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / totalMs));

  const mins = Math.floor(remainingMs / 60_000);
  const secs = Math.floor((remainingMs % 60_000) / 1_000);
  const clockText = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const r = 7;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="cmd-focus-pill cmd-focus-pill--active pr-1.5">
      <svg className="size-4 -rotate-90 shrink-0" viewBox="0 0 18 18" aria-hidden>
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.18"
          strokeWidth="2"
        />
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="var(--land-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 600ms linear" }}
        />
      </svg>
      <span className="max-w-[92px] truncate text-[12px] font-medium max-md:hidden">{focus.title}</span>
      <span className="font-mono text-[11.5px] font-semibold tabular-nums text-[color:var(--land-gold-soft)]">
        {clockText}
      </span>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              disabled={busy}
              onClick={onEnd}
              aria-label="End focus session"
              className="grid size-5 place-items-center rounded-full bg-foreground/10 text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              <Square className="size-2.5 fill-current" />
            </button>
          }
        />
        <TooltipContent side="bottom">End focus session</TooltipContent>
      </Tooltip>
    </div>
  );
}
