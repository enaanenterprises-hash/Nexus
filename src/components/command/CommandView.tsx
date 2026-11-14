"use client";

import { useState, useSyncExternalStore } from "react";
import { getConnector } from "@/lib/connectors/catalog";
import { CloseIcon, SyncIcon } from "@/components/dashboard/icons";
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
const todayLabel = () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

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
        <nav className="cmd-tabs" aria-label="Command views">
          {TABS.map((t) => (
            <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} className={`cmd-tab ${tab === t.id ? "cmd-tab--on" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "connections" && state?.connections.length ? <span className="cmd-tab-count">{state.connections.length}</span> : null}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          {state?.connections.length ? (
            <button type="button" className="cmd-sync" onClick={() => void command.sync()} disabled={command.syncing} title="Refresh every connected service">
              <SyncIcon size={14} className={command.syncing ? "cmd-spin" : ""} />
              <span className="max-sm:hidden">{command.syncing ? "Syncing" : lastSync ? relative(lastSync, now) : "Sync"}</span>
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="research-icon-button" aria-label="Close Command" title="Back to the network">
            <CloseIcon size={15} />
          </button>
        </div>
      </header>

      {notice ? (
        <div className="cmd-notice" role="status">
          <span>{notice}</span>
          <button type="button" className="research-icon-button h-6 w-6" onClick={() => setNotice(null)} aria-label="Dismiss">
            <CloseIcon size={12} />
          </button>
        </div>
      ) : null}
      {state && command.error ? (
        <div className="cmd-notice cmd-notice--warn" role="status">
          Could not refresh: {command.error}
        </div>
      ) : null}
      {state?.errors.length ? (
        <div className="cmd-notice cmd-notice--warn" role="status">
          {state.errors.map((e) => `${getConnector(e.connectorId)?.name ?? e.connectorId}: ${e.message}`).join(" · ")}
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
