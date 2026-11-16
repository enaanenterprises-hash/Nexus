"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { connectGoogleService } from "@/lib/command/google-connect";
import type { CommandItemOf } from "@/lib/command/kinds";
import { getConnector } from "@/lib/connectors/catalog";
import { commandApi, type LiveWeather } from "../command-client";
import { clock, dayLabel, relative } from "../format";
import { useNow } from "../parts";
import type { CommandController } from "../use-command";
import { WidgetFrame } from "./frame";

function scopeOf(connectorId: string) {
  const auth = getConnector(connectorId)?.auth;
  return auth?.type === "oauth" ? auth.scopes[0] : null;
}

function Gate({
  connectorId,
  command,
  onConnections,
  children,
}: {
  connectorId: string;
  command: CommandController;
  onConnections: () => void;
  children: ReactNode;
}) {
  const connection = command.state!.connections.find((c) => c.connectorId === connectorId) ?? null;
  const manifest = getConnector(connectorId);
  const scope = scopeOf(connectorId);
  if (!connection) {
    const google = manifest?.auth.type === "oauth" && manifest.auth.provider === "google";
    const quick = manifest?.auth.type === "none" && !(manifest.settings ?? []).some((s) => s.type === "location" || s.key === "urls");
    return (
      <div className="cmd-widget-empty">
        <p>{manifest?.name ?? "This service"} is not connected. Nothing is shown until it is.</p>
        {scope ? <p className="cmd-scope">{scope}</p> : null}
        {google ? (
          <Button
            type="button"
            size="sm"
            className="w-fit border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
            onClick={() => void connectGoogleService(connectorId)}
          >
            Connect {manifest?.name}
          </Button>
        ) : quick ? (
          <Button
            type="button"
            size="sm"
            className="w-fit border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
            onClick={() => void command.connect(connectorId, {})}
          >
            Connect {manifest?.name}
          </Button>
        ) : (
          <button type="button" className="cmd-link text-[13px]" onClick={onConnections}>
            Set up in Connections
          </button>
        )}
      </div>
    );
  }
  if (connection.status === "needs_auth") {
    return (
      <div className="cmd-widget-empty">
        <p>{connection.lastError ?? `${manifest?.name} needs to be connected again.`}</p>
        {scope ? <p className="cmd-scope">{scope}</p> : null}
      </div>
    );
  }
  return (
    <>
      {connection.status !== "ok" && connection.lastError ? <p className="cmd-error mb-2">{connection.lastError}</p> : null}
      {children}
    </>
  );
}

function placedStyle(style: CSSProperties) {
  return style;
}

export function CalendarWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const now = useNow(60_000);
  const events = command.state!.items
    .filter((item): item is CommandItemOf<"command.event"> => item.kind === "command.event" && item.data.connectorId === "google-calendar" && item.data.status !== "cancelled")
    .filter((item) => Date.parse(item.data.startsAt) >= now - 60 * 60_000)
    .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt))
    .slice(0, 8);
  return (
    <WidgetFrame title="Calendar" hint="Coming up" onRemove={onRemove} style={placedStyle(style)}>
      <Gate connectorId="google-calendar" command={command} onConnections={onConnections}>
        {events.length === 0 ? <p className="cmd-empty">Nothing on the calendar.</p> : null}
        {events.map((event) => (
          <div key={event.id} className="cmd-cal-row">
            <span className="cmd-cal-time">{event.data.allDay ? "All day" : clock(event.data.startsAt)}</span>
            <span className="min-w-0 flex-1 truncate">{event.title}</span>
            <span className="text-[11px] text-[color:var(--land-faint)]">{dayLabel(event.data.startsAt)}</span>
          </div>
        ))}
      </Gate>
    </WidgetFrame>
  );
}

export function WeatherWidget({ onRemove, style }: { onRemove: () => void; style: CSSProperties }) {
  const [weather, setWeather] = useState<LiveWeather | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    commandApi.weather().then(
      (result) => alive && setWeather(result.signal),
      (reason: Error) => {
        if (!alive) return;
        setError(reason.message);
        setWeather(null);
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  const details = weather?.data.details;
  const hours = typeof details?.["hourly"] === "string" ? details["hourly"].split(",").slice(0, 6) : [];
  return (
    <WidgetFrame title="Weather" hint={weather ? String(details?.["location"] ?? "") : undefined} onRemove={onRemove} style={style}>
      {weather === undefined ? <p className="cmd-empty">Reading the sky…</p> : null}
      {weather === null ? <p className="cmd-empty">{error ?? "Weather is unavailable."}</p> : null}
      {weather ? (
        <>
          <p className="cmd-wx-temp">{weather.data.value}°</p>
          <p className="mt-1 text-[13px] text-[color:var(--land-muted)]">
            {String(details?.["condition"] ?? "")}
            <span className="text-[color:var(--land-faint)]">
              {" "}
              · H {String(details?.["high"])}° L {String(details?.["low"])}°
            </span>
          </p>
          <ol className="cmd-wx-hours">
            {hours.map((hour, index) => {
              const [t, temp] = hour.split(":").map(Number);
              const at = new Date(t! * 1000);
              return (
                <li key={index}>
                  <span>{temp}°</span>
                  <span className="text-[color:var(--land-faint)]">{index === 0 ? "Now" : at.toLocaleTimeString(undefined, { hour: "numeric" })}</span>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </WidgetFrame>
  );
}

export function TasksWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const tasks = command.state!.items
    .filter((item): item is CommandItemOf<"command.task"> => item.kind === "command.task" && item.data.connectorId === "google-tasks" && item.data.status === "open")
    .slice(0, 10);
  return (
    <WidgetFrame title="Tasks" hint={`${tasks.length} open`} onRemove={onRemove} style={style}>
      <Gate connectorId="google-tasks" command={command} onConnections={onConnections}>
        {tasks.length === 0 ? <p className="cmd-empty">No open tasks.</p> : null}
        {tasks.map((task) => (
          <div key={task.id} className="cmd-task-row">
            <span aria-hidden className="mt-0.5 h-3 w-3 flex-none rounded-full border border-[color:var(--land-line)]" />
            <span className="min-w-0 flex-1 truncate">{task.title}</span>
          </div>
        ))}
      </Gate>
    </WidgetFrame>
  );
}

export function CryptoWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const coins = command.state!.items.filter(
    (item): item is CommandItemOf<"command.signal"> => item.kind === "command.signal" && item.data.metric.startsWith("market.crypto."),
  );
  return (
    <WidgetFrame title="Crypto" hint="24h" onRemove={onRemove} style={style}>
      <Gate connectorId="markets" command={command} onConnections={onConnections}>
        {coins.length === 0 ? <p className="cmd-empty">No prices yet.</p> : null}
        {coins.map((coin) => (
          <div key={coin.id} className="cmd-crypto-row">
            <span className="text-[13px]">{coin.title}</span>
            <span className="text-right">
              <span className="cmd-crypto-price">{coin.data.display}</span>
              <span className={`ml-2 text-[12px] ${coin.data.change !== null && coin.data.change < 0 ? "cmd-down" : "cmd-up"}`}>
                {typeof coin.data.details["changeLabel"] === "string" ? coin.data.details["changeLabel"] : ""}
              </span>
            </span>
          </div>
        ))}
      </Gate>
    </WidgetFrame>
  );
}

export function SkyWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const sky = command.state!.items.find((item): item is CommandItemOf<"command.signal"> => item.kind === "command.signal" && item.data.metric === "sky.tonight");
  const details = sky?.data.details;
  return (
    <WidgetFrame title="Night sky" onRemove={onRemove} style={style}>
      <Gate connectorId="sky" command={command} onConnections={onConnections}>
        {!sky ? (
          <p className="cmd-empty">No sky reading yet.</p>
        ) : (
          <div className="flex items-center gap-3">
            <span className="cmd-moon" aria-hidden />
            <div>
              <p className="text-[14px]">{String(details?.["moonPhase"] ?? sky.data.display)}</p>
              <p className="text-[12px] text-[color:var(--land-faint)]">
                {String(details?.["moonIllumination"] ?? "")}% · sunset {clock(typeof details?.["sunset"] === "string" ? details["sunset"] : null)}
              </p>
            </div>
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

export function F1Widget({ command, onRemove, onConnections, style }: WidgetProps) {
  const now = useNow(60_000);
  const sessions = command.state!.items
    .filter((item): item is CommandItemOf<"command.event"> => item.kind === "command.event" && item.data.connectorId === "f1")
    .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt));
  const place = sessions[0]?.data.location;
  return (
    <WidgetFrame title="Formula 1" hint={place ?? undefined} onRemove={onRemove} style={style}>
      <Gate connectorId="f1" command={command} onConnections={onConnections}>
        {sessions.length === 0 ? <p className="cmd-empty">No upcoming sessions.</p> : null}
        {sessions.map((session) => (
          <div key={session.id} className="cmd-f1-row">
            <span className="truncate">{session.title}</span>
            <span className="text-[color:var(--land-muted)]">{relative(session.data.startsAt, now)}</span>
          </div>
        ))}
      </Gate>
    </WidgetFrame>
  );
}

export function UptimeWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const sites = command.state!.items.filter(
    (item): item is CommandItemOf<"command.signal"> => item.kind === "command.signal" && item.data.metric.startsWith("uptime."),
  );
  return (
    <WidgetFrame title="Uptime" onRemove={onRemove} style={style}>
      <Gate connectorId="uptime" command={command} onConnections={onConnections}>
        {sites.length === 0 ? <p className="cmd-empty">No sites are being watched.</p> : null}
        {sites.map((site) => {
          const ms = site.data.value ?? 0;
          const width = site.data.value === null ? 100 : Math.max(8, Math.min(100, (ms / 2000) * 100));
          return (
            <div key={site.id}>
              <div className="flex justify-between text-[12.5px]">
                <span className="truncate">{site.title}</span>
                <span className={site.data.status === "poor" ? "cmd-down" : "cmd-up"}>{site.data.display}</span>
              </div>
              <div className="cmd-up-meter" aria-hidden>
                <span style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </Gate>
    </WidgetFrame>
  );
}

export function GitHubWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const items = command.state!.items.filter((item) => item.data.connectorId === "github").slice(0, 6);
  return (
    <WidgetFrame title="GitHub" onRemove={onRemove} style={style}>
      <Gate connectorId="github" command={command} onConnections={onConnections}>
        {items.length === 0 ? <p className="cmd-empty">No reviews, issues, or pushes.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="cmd-gh-row">
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            {item.kind === "command.task" ? <span className="text-[11px] text-[color:var(--land-faint)]">{item.data.project}</span> : null}
          </div>
        ))}
      </Gate>
    </WidgetFrame>
  );
}

export function StravaWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const latest = command.state!.items
    .filter((item): item is CommandItemOf<"command.activity"> => item.kind === "command.activity" && item.data.connectorId === "strava")
    .sort((a, b) => Date.parse(b.data.startedAt) - Date.parse(a.data.startedAt))[0];
  const km = latest?.data.metrics["distance_km"];
  return (
    <WidgetFrame title="Strava" onRemove={onRemove} style={style}>
      <Gate connectorId="strava" command={command} onConnections={onConnections}>
        {!latest ? (
          <p className="cmd-empty">No activities this week.</p>
        ) : (
          <>
            <p className="cmd-run-distance">{typeof km === "number" ? km.toFixed(1) : "—"}</p>
            <p className="text-[12px] text-[color:var(--land-faint)]">km · {latest.title}</p>
          </>
        )}
      </Gate>
    </WidgetFrame>
  );
}

export function VercelWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const deploys = command.state!.items
    .filter((item): item is CommandItemOf<"command.activity"> => item.kind === "command.activity" && item.data.connectorId === "vercel")
    .slice(0, 5);
  return (
    <WidgetFrame title="Vercel" onRemove={onRemove} style={style}>
      <Gate connectorId="vercel" command={command} onConnections={onConnections}>
        {deploys.length === 0 ? <p className="cmd-empty">No recent deployments.</p> : null}
        {deploys.map((deploy) => (
          <div key={deploy.id} className="cmd-deploy-row">
            <span className={`text-[11px] uppercase tracking-wide ${deploy.data.status === "failed" ? "cmd-down" : "text-[color:var(--land-muted)]"}`}>{deploy.data.status.replace("_", " ")}</span>
            <span className="min-w-0 flex-1 truncate">{deploy.title}</span>
          </div>
        ))}
      </Gate>
    </WidgetFrame>
  );
}

type WidgetProps = {
  command: CommandController;
  onRemove: () => void;
  onConnections: () => void;
  style: CSSProperties;
};
