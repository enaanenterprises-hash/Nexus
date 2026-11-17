"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getConnector } from "@/lib/connectors/catalog";
import { ConnectionsView } from "./ConnectionsView";
import { relative } from "./format";
import { OverviewView } from "./OverviewView";
import { useNow } from "./parts";
import { useCommand } from "./use-command";

export type CommandTab = "overview" | "connections";

const TABS: { id: CommandTab; label: string }[] = [
  { id: "overview", label: "Overview" },
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
    `What's moving today, ${name}?`,
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
  /** Incremented by Dashboard each time Command is opened so greetings cycle reliably. */
  openCount?: number;
  /** Set by the dashboard after an OAuth round trip, e.g. `{ tab: "connections", service: "strava", notice }`. */
  request: { tab: CommandTab; service: string | null; notice: string | null; serial: number } | null;
  onClose: () => void;
};

/** Nexus Command: connected services, one daily timeline, and deterministic automations. */
export function CommandView({ userName, openCount = 0, request, onClose }: Props) {
  const command = useCommand();
  const [tab, setTab] = useState<CommandTab>("overview");
  const [notice, setNotice] = useState<string | null>(null);
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

  const [handled, setHandled] = useState<number | null>(null);
  if (request && request.serial !== handled) {
    setHandled(request.serial);
    setTab(request.tab);
    setNotice(request.notice);
  }

  return (
    <section aria-label="Command" className="cmd-screen flex h-full min-h-0 flex-col">
      <header className="cmd-header grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 py-2 pr-3 pl-[64px] sm:pr-5 md:grid-cols-[1fr_auto_1fr] md:gap-y-0 md:py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2
            suppressHydrationWarning
            className="truncate text-[14.5px] leading-none font-medium tracking-[-0.015em] text-foreground sm:text-[15.5px]"
          >
            {activeGreeting}
          </h2>
          <span
            suppressHydrationWarning
            className="hidden shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground/75 lg:inline"
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
            className="h-7 gap-0.5 rounded-full border border-border/65 bg-card/75 p-0.5"
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="h-6 gap-1.5 rounded-full px-3 text-[12px] font-medium text-muted-foreground data-[active]:bg-foreground data-[active]:text-background data-[active]:shadow-xs"
              >
                <span>{t.label}</span>
                {t.id === "connections" && state?.connections.length ? (
                  <span className="rounded-full bg-current/15 px-1.5 py-px text-[10px] leading-none tabular-nums">
                    {state.connections.length}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center justify-end gap-1 justify-self-end">
          {state?.connections.length ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="h-7 gap-1.5 rounded-full px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground"
                    onClick={() => void command.sync()}
                    disabled={command.syncing}
                  >
                    <RefreshCw className={`size-3 ${command.syncing ? "animate-spin" : ""}`} />
                    <span className="max-sm:hidden">
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
                  className="size-7 rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="bottom">Back to the network</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {notice ? (
        <div className="px-6 pt-3 sm:px-8">
          <Alert role="status" className="rounded-xl border-border/80 bg-card/80 py-2.5">
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
        <div className="px-6 pt-3 sm:px-8">
          <Alert variant="destructive" role="status" className="rounded-xl py-2.5">
            <AlertDescription className="text-[13px]">
              Could not refresh: {command.error}
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      {state?.errors.length ? (
        <div className="px-6 pt-3 sm:px-8">
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
              <p className="dash-eyebrow flex items-center gap-2">
                <span className="state-dot state-dot--thinking" />
                Loading Command
              </p>
            </div>
          )
        ) : tab === "overview" ? (
          <OverviewView command={command} onConnections={() => setTab("connections")} />
        ) : (
          <ConnectionsView command={command} focusId={request?.service ?? null} />
        )}
      </div>
    </section>
  );
}
