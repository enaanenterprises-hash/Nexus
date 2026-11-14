"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getConnector } from "@/lib/connectors/catalog";
import { CloseIcon, SyncIcon } from "@/components/dashboard/icons";
import { AutomationsView } from "./AutomationsView";
import { commandApi, viewerTimeZone } from "./command-client";
import { ConnectionsView, LocationInput } from "./ConnectionsView";
import { relative } from "./format";
import { SourceGlyph, useNow } from "./parts";
import { TodayView } from "./TodayView";
import { useCommand, type CommandController } from "./use-command";

export type CommandTab = "today" | "connections" | "automations";

const TABS: { id: CommandTab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "connections", label: "Connections" },
  { id: "automations", label: "Automations" },
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
  const [tab, setTab] = useState<CommandTab>("today");
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
    <section aria-label="Command" className="flex h-full min-h-0 flex-col">
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
      {state?.errors.length ? (
        <div className="cmd-notice cmd-notice--warn" role="status">
          {state.errors.map((e) => `${getConnector(e.connectorId)?.name ?? e.connectorId}: ${e.message}`).join(" · ")}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
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
        ) : tab === "today" ? (
          state.connections.length ? (
            <TodayView command={command} onConnections={() => setTab("connections")} />
          ) : (
            <QuickStart command={command} onBrowse={() => setTab("connections")} />
          )
        ) : tab === "connections" ? (
          <ConnectionsView command={command} focusId={request?.service ?? null} />
        ) : (
          <AutomationsView command={command} />
        )}
      </div>
    </section>
  );
}

const QUICK = ["weather", "sky", "markets", "f1", "uptime"] as const;

function QuickStart({ command, onBrowse }: { command: CommandController; onBrowse: () => void }) {
  const [location, setLocation] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(["weather", "sky", "markets", "f1"]));
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const city = viewerTimeZone().split("/").at(-1)?.replace(/_/g, " ");
    if (!city) return;
    commandApi.geocode(city).then((r) => setLocation((l) => l || r.places[0]?.value || ""), () => {});
  }, []);

  async function connectPicked() {
    setWorking(true);
    setError(null);
    for (const id of QUICK.filter((q) => picked.has(q))) {
      const needsLocation = id === "weather" || id === "sky";
      const failure = await command.connect(id, needsLocation ? { settings: { location } } : {});
      if (failure) {
        setError(`${getConnector(id)?.name}: ${failure}`);
        break;
      }
    }
    setWorking(false);
  }

  return (
    <div className="mx-auto w-full max-w-[38rem] px-6 pb-20 pt-[9vh] sm:px-10">
      <p className="dash-eyebrow">Command · core node</p>
      <h2 className="mt-3 text-[clamp(1.8rem,3.2vw,2.5rem)] font-light leading-tight tracking-[-0.025em]">Bring your world into Nexus.</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--land-muted)]">
        Connect the services you use. Your day lands on one timeline, and services start working together on their own. These need no keys:
      </p>
      <ul className="mt-8">
        {QUICK.map((id) => {
          const m = getConnector(id)!;
          const on = picked.has(id);
          return (
            <li key={id}>
              <label className="flex cursor-pointer items-center gap-4 border-b border-[color:var(--land-hair)] py-3.5">
                <SourceGlyph connectorId={id} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium">{m.name}</span>
                  <span className="block truncate text-[12.5px] text-[color:var(--land-faint)]">{m.description}</span>
                </span>
                <input
                  type="checkbox"
                  className="cmd-check"
                  checked={on}
                  onChange={() =>
                    setPicked((p) => {
                      const next = new Set(p);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                />
              </label>
            </li>
          );
        })}
      </ul>
      {picked.has("weather") || picked.has("sky") ? (
        <div className="mt-6">
          <LocationInput field={{ label: "Location for weather and sky" }} value={location} onChange={setLocation} />
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button type="button" className="dash-button dash-button--gold h-9 px-4 text-[13px]" disabled={working || picked.size === 0 || ((picked.has("weather") || picked.has("sky")) && !location)} onClick={() => void connectPicked()}>
          {working ? "Connecting…" : `Connect ${picked.size} service${picked.size === 1 ? "" : "s"}`}
        </button>
        <button type="button" className="cmd-link text-[13px]" onClick={onBrowse}>
          Calendar, Gmail, GitHub, Strava and more →
        </button>
      </div>
      {error ? <p className="cmd-error mt-4">{error}</p> : null}
    </div>
  );
}
