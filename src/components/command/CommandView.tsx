"use client";

import { useState, useSyncExternalStore } from "react";
import { RefreshCw, X } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

const noopSubscribe = () => () => {};
const todayLabel = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

type Props = {
  /** Set by the dashboard after an OAuth round trip, e.g. `{ tab: "connections", service: "strava", notice }`. */
  request: { tab: CommandTab; service: string | null; notice: string | null; serial: number } | null;
  onClose: () => void;
};

/** Nexus Command: connected services, one daily timeline, and deterministic automations. */
export function CommandView({ request, onClose }: Props) {
  const command = useCommand();
  const [tab, setTab] = useState<CommandTab>("overview");
  const [notice, setNotice] = useState<string | null>(null);
  const date = useSyncExternalStore(noopSubscribe, todayLabel, () => "");
  const now = useNow(30_000);
  const state = command.state;
  const lastSync = state?.connections.map((c) => c.lastSyncAt).filter(Boolean).sort().at(-1) ?? null;

  const [handled, setHandled] = useState<number | null>(null);
  if (request && request.serial !== handled) {
    setHandled(request.serial);
    setTab(request.tab);
    setNotice(request.notice);
  }

  return (
    <section aria-label="Command" className="cmd-screen flex h-full min-h-0 flex-col">
      <header className="cmd-header">
        <div className="min-w-0">
          <p className="dash-eyebrow">{date || "Today"}</p>
          <h2 className="mt-1 text-[19px] font-medium tracking-[-0.015em]">Command</h2>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as CommandTab)} className="max-sm:order-3 max-sm:w-full">
          <TabsList variant="line" aria-label="Command views" className="gap-1 max-sm:w-full max-sm:justify-start">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="gap-1.5 rounded-none px-2.5 py-1.5 text-[13.5px] font-medium"
              >
                <span>{t.label}</span>
                {t.id === "connections" && state?.connections.length ? (
                  <Badge variant="secondary" className="h-4 min-w-4 px-1.5 text-[10px] tabular-nums">
                    {state.connections.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1.5">
          {state?.connections.length ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 rounded-full px-3 text-[12.5px] text-muted-foreground hover:text-foreground"
                    onClick={() => void command.sync()}
                    disabled={command.syncing}
                  >
                    <RefreshCw className={`size-3.5 ${command.syncing ? "animate-spin" : ""}`} />
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
                  size="icon-sm"
                  onClick={onClose}
                  aria-label="Close Command"
                  className="rounded-full"
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
