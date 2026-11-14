"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ACTION_DEFINITIONS } from "@/lib/command/actions";
import type { CommandItem, CommandItemOf } from "@/lib/command/kinds";
import { buildTimeline, type TimelineEntry } from "@/lib/command/timeline";
import { getConnector } from "@/lib/connectors/catalog";
import { ExternalIcon } from "@/components/dashboard/icons";
import { viewerTimeZone } from "./command-client";
import { clock, countdown, dayLabel, money, relative, sourceName } from "./format";
import { KindIcon, Section, SourceGlyph, StatusDot, useNow } from "./parts";
import type { CommandController } from "./use-command";

export function TodayView({ command, onConnections }: { command: CommandController; onConnections: () => void }) {
  const state = command.state!;
  const now = useNow(15_000);
  const timeZone = useMemo(() => viewerTimeZone(), []);
  const timeline = useMemo(() => buildTimeline(state.items, { now: new Date(now), timeZone }), [state.items, now, timeZone]);
  const { goals, anytime } = timeline;
  const upcoming = state.items
    .filter((i): i is CommandItemOf<"command.event"> => i.kind === "command.event" && Date.parse(i.data.startsAt) > now && !timeline.entries.some((e) => e.item.id === i.id))
    .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt))
    .slice(0, 4);
  const purchases = state.items.filter((i): i is CommandItemOf<"command.purchase"> => i.kind === "command.purchase").slice(0, 4);

  return (
    <div className="cmd-today">
      {timeline.signals.length ? <SignalStrip signals={timeline.signals} /> : null}
      <div className="cmd-today-grid">
        <div className="min-w-0">
          <HourlyStrip signal={timeline.signals.find((x) => x.data.metric === "weather.now")} />
          <Section title="Today" aside={<>{timeline.entries.length} on the timeline</>}>
            {timeline.entries.length ? (
              <ol className="cmd-timeline">
                {timeline.entries.map((entry, i) => (
                  <TimelineRow key={entry.item.id} entry={entry} showNow={i === timeline.nowIndex} now={now} />
                ))}
                {timeline.nowIndex === timeline.entries.length ? <NowMarker now={now} /> : null}
              </ol>
            ) : (
              <p className="cmd-empty">
                Nothing timed today yet.{" "}
                {state.connections.some((c) => c.connectorId === "google-calendar") ? null : (
                  <button type="button" className="cmd-link" onClick={onConnections}>
                    Connect Google Calendar
                  </button>
                )}
              </p>
            )}
          </Section>
          {anytime.length ? (
            <Section title="Anytime" aside={<>{anytime.filter((t) => t.data.status === "open").length} open</>}>
              <ul>
                {anytime.slice(0, 12).map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </ul>
            </Section>
          ) : null}
        </div>
        <aside className="cmd-side">
          <FocusPanel command={command} now={now} />
          <GoalsPanel command={command} goals={goals} />
          {timeline.shipments.length ? (
            <Section title="Deliveries">
              <ul className="space-y-3">
                {timeline.shipments.map((s) => (
                  <li key={s.id} className="flex items-start gap-3">
                    <span className="mt-0.5 text-[color:var(--land-gold-soft)]">
                      <KindIcon kind="command.shipment" size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px]">{s.title}</p>
                      <p className="text-[12px] text-[color:var(--land-faint)]">
                        {s.data.eta ? `Est. ${dayLabel(s.data.eta)}` : "In transit"} · {s.data.trackingNumber}
                      </p>
                    </div>
                    {s.data.url ? <ItemLink href={s.data.url} label={`Track ${s.title}`} /> : null}
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {purchases.length ? (
            <Section title="Recorded purchases" aside="on the network">
              <ul className="space-y-2">
                {purchases.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="truncate">{p.data.merchant}</span>
                    <span className="tabular-nums text-[color:var(--land-muted)]">{money(p.data.total, p.data.currency)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {upcoming.length ? (
            <Section title="Coming up">
              <ul className="space-y-3">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-start gap-3">
                    <SourceGlyph connectorId={e.data.connectorId} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px]">{e.title}</p>
                      <p className="text-[12px] text-[color:var(--land-faint)]">
                        {dayLabel(e.data.startsAt)} · {clock(e.data.startsAt)} · <span className="text-[color:var(--land-gold-soft)]">{relative(e.data.startsAt, now)}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <RunsPanel command={command} />
        </aside>
      </div>
    </div>
  );
}

function SignalStrip({ signals }: { signals: CommandItemOf<"command.signal">[] }) {
  return (
    <div className="cmd-signals" role="list" aria-label="Live readings">
      {signals.map((s) => {
        const r = reading(s);
        return (
          <a key={s.id} role="listitem" href={s.data.url ?? undefined} target="_blank" rel="noopener noreferrer" className="cmd-signal" title={`${sourceName(s.data.connectorId)} · ${s.title}`}>
            <span className="cmd-signal-label">
              <StatusDot tone={s.data.status === "good" ? "ok" : s.data.status === "fair" ? "warn" : s.data.status === "poor" ? "alert" : "idle"} />
              {r.label}
            </span>
            <span className="cmd-signal-value">{r.value}</span>
            <span className={`cmd-signal-sub ${r.trend === "up" ? "cmd-up" : r.trend === "down" ? "cmd-down" : ""}`}>{r.sub}</span>
          </a>
        );
      })}
    </div>
  );
}

function reading(s: CommandItemOf<"command.signal">): { label: string; value: string; sub: string; trend?: "up" | "down" } {
  const d = s.data.details;
  if (s.data.metric === "weather.now") {
    const rain = Number(d["rainChance"] ?? 0);
    return { label: String(d["location"] ?? "Weather"), value: `${s.data.value}°`, sub: `${d["condition"]} · H ${d["high"]}° L ${d["low"]}°${rain >= 30 ? ` · ${rain}% rain` : ""}` };
  }
  if (s.data.metric === "sky.tonight") {
    const dark = d["darkStart"] ? `dark ${clock(String(d["darkStart"]))}` : `sunset ${clock(String(d["sunset"]))}`;
    return { label: "Tonight's sky", value: s.data.display.split(" · ")[0]!, sub: `${d["moonIllumination"]}% moon · ${dark}` };
  }
  if (s.data.metric.startsWith("market.")) {
    const change = s.data.change;
    return {
      label: s.title,
      value: s.data.display,
      sub: change === null ? String(d["asOf"] ?? "") : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(2)}%${d["window"] ? ` ${d["window"]}` : ""}`,
      trend: change === null ? undefined : change >= 0 ? "up" : "down",
    };
  }
  if (s.data.metric.startsWith("uptime.")) {
    return { label: s.title, value: s.data.value === null ? "Down" : `${s.data.value} ms`, sub: s.data.value === null ? `Answered ${d["code"]}` : "Up" };
  }
  if (s.data.metric === "training.load") return { label: "Training load", value: `${s.data.value} min`, sub: `7 days · ${d["advice"]}` };
  return { label: s.title, value: s.data.display, sub: sourceName(s.data.connectorId) };
}

function HourlyStrip({ signal }: { signal: CommandItemOf<"command.signal"> | undefined }) {
  const raw = signal?.data.details["hourly"];
  if (typeof raw !== "string" || !raw) return null;
  const hours = raw.split(",").map((h) => {
    const [t, temp, rain] = h.split(":").map(Number);
    return { at: new Date(t! * 1000), temp: temp!, rain: rain! };
  });
  return (
    <Section title="Next hours" aside={<>{String(signal!.data.details["location"] ?? "")} · rain chance</>}>
      <ol className="cmd-hours">
        {hours.map((h, i) => (
          <li key={i} className="cmd-hour" title={`${h.rain}% chance of rain`}>
            <span className="text-[13px]">{h.temp}°</span>
            <span className="cmd-hour-bar" aria-hidden>
              <span style={{ height: `${Math.max(3, h.rain)}%` }} />
            </span>
            <span className="text-[10.5px] text-[color:var(--land-faint)]">{i === 0 ? "Now" : h.at.toLocaleTimeString(undefined, { hour: "numeric" })}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function NowMarker({ now }: { now: number }) {
  return (
    <li className="cmd-now" aria-label={`Now, ${clock(new Date(now).toISOString())}`}>
      <span className="cmd-now-time">{clock(new Date(now).toISOString())}</span>
      <span className="cmd-now-line" />
    </li>
  );
}

function TimelineRow({ entry, showNow, now }: { entry: TimelineEntry; showNow: boolean; now: number }) {
  const { item } = entry;
  return (
    <>
      {showNow ? <NowMarker now={now} /> : null}
      <li className={`cmd-entry ${entry.past ? "cmd-entry--past" : ""} ${entry.live ? "cmd-entry--live" : ""}`}>
        <span className="cmd-entry-time">{item.kind === "command.event" && item.data.allDay ? "All day" : clock(entry.at)}</span>
        <span className="cmd-entry-node" aria-hidden>
          <KindIcon kind={item.kind} size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="cmd-entry-title">
            {item.title}
            {entry.live ? <span className="cmd-live-tag">Now</span> : null}
          </p>
          <p className="cmd-entry-meta">
            <SourceGlyph connectorId={item.data.connectorId} />
            <span className="truncate">{meta(item, entry)}</span>
          </p>
        </div>
        {item.data.url ? <ItemLink href={item.data.url} label={`Open ${item.title}`} /> : null}
      </li>
    </>
  );
}

function meta(item: CommandItem, entry: TimelineEntry): string {
  const source = sourceName(item.data.connectorId);
  switch (item.kind) {
    case "command.event":
      return [entry.endsAt ? `${clock(entry.at)}–${clock(entry.endsAt)}` : null, item.data.location, source].filter(Boolean).join(" · ");
    case "command.activity":
      return [item.data.status === "failed" ? "Failed" : item.data.status === "in_progress" ? "In progress" : null, item.data.detail, item.data.durationMin ? `${item.data.durationMin} min` : null, source]
        .filter(Boolean)
        .join(" · ");
    case "command.shipment":
      return `Arriving · ${item.data.carrier.toUpperCase()} ${item.data.trackingNumber}`;
    case "command.task":
      return [item.data.status === "done" ? "Done" : "Due", item.data.project, source].filter(Boolean).join(" · ");
    case "command.deadline":
      return ["Due", item.data.course, source].filter(Boolean).join(" · ");
    default:
      return source;
  }
}

function TaskRow({ task }: { task: CommandItemOf<"command.task"> }) {
  const done = task.data.status === "done";
  return (
    <li className="flex items-start gap-3 border-b border-[color:var(--land-hair)] py-2.5 last:border-b-0">
      <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${done ? "bg-white/15" : task.data.priority === "high" ? "bg-[color:var(--land-gold)]" : task.data.priority === "medium" ? "border border-[color:var(--land-gold)]" : "bg-white/25"}`} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[14px] ${done ? "text-[color:var(--land-faint)] line-through" : ""}`}>{task.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-[color:var(--land-faint)]">
          <SourceGlyph connectorId={task.data.connectorId} />
          <span className="truncate">{task.data.project ?? sourceName(task.data.connectorId)}</span>
        </p>
      </div>
      {task.data.url ? <ItemLink href={task.data.url} label={`Open ${task.title}`} /> : null}
    </li>
  );
}

function ItemLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="research-icon-button -mr-1 h-7 w-7 opacity-60 hover:opacity-100" aria-label={label} title="Open in its app">
      <ExternalIcon size={13} />
    </a>
  );
}

const DURATIONS = [25, 50, 90];

function FocusPanel({ command, now }: { command: CommandController; now: number }) {
  const state = command.state!;
  const focus = state.focus;
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState(50);
  const [targetItemId, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = command.pending === "focus";
  const candidates = state.items.filter((i): i is CommandItemOf<"command.task"> | CommandItemOf<"command.deadline"> => (i.kind === "command.task" && i.data.status === "open" && !i.data.goal) || i.kind === "command.deadline").slice(0, 5);

  const recipe = state.recipes.find((r) => r.id === "deep-work-start");
  const connected = state.connections.map((c) => getConnector(c.connectorId)).filter((m) => m !== undefined);
  const plan = (recipe?.enabled ? recipe.actions : []).map((a) => ({
    label: ACTION_DEFINITIONS[a.action].label,
    by: connected.filter((m) => m.actions.includes(a.action)).map((m) => m.name),
  }));

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setError(await command.startFocus({ title: title.trim(), minutes, targetItemId }));
  }

  if (focus) {
    const total = Date.parse(focus.endsAt) - Date.parse(focus.startedAt);
    const left = Math.max(0, Date.parse(focus.endsAt) - now);
    return (
      <Section title="Deep work" aside={<span className="text-[color:var(--land-gold-soft)]">in session</span>}>
        <div className="cmd-focus cmd-focus--on">
          <p className="cmd-focus-timer tabular-nums">{left > 0 ? countdown(focus.endsAt, now) : "Time"}</p>
          <p className="mt-1 truncate text-[14.5px]">{focus.title}</p>
          <div className="cmd-progress mt-4">
            <span style={{ width: `${Math.min(100, ((total - left) / total) * 100)}%` }} />
          </div>
          <p className="mt-2 text-[12px] text-[color:var(--land-faint)]">Until {clock(focus.endsAt)}</p>
          <button type="button" className="dash-button dash-button--gold mt-4" disabled={busy} onClick={() => void command.endFocus().then(setError)}>
            {busy ? "Wrapping up…" : "End session"}
          </button>
        </div>
        {error ? <p className="cmd-error mt-2">{error}</p> : null}
      </Section>
    );
  }

  return (
    <Section title="Deep work">
      <form onSubmit={start} className="cmd-focus">
        <label htmlFor="cmd-focus-title" className="sr-only">
          What are you working on?
        </label>
        <input id="cmd-focus-title" className="cmd-field w-full" value={title} onChange={(e) => (setTitle(e.target.value), setTarget(null))} placeholder="What are you working on?" maxLength={200} autoComplete="off" />
        {candidates.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`research-tag max-w-full truncate ${targetItemId === c.id ? "research-tag--on" : ""}`}
                onClick={() => (setTitle(c.title.replace(/^Review: /, "")), setTarget(c.id))}
                title={c.title}
              >
                {c.title.length > 34 ? `${c.title.slice(0, 33)}…` : c.title}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <div className="research-segment" role="group" aria-label="Duration">
            {DURATIONS.map((d) => (
              <button key={d} type="button" aria-pressed={minutes === d} onClick={() => setMinutes(d)} className="!w-auto px-2.5 text-[12px] font-medium">
                {d}m
              </button>
            ))}
          </div>
          <button type="submit" className="dash-button dash-button--gold ml-auto" disabled={!title.trim() || busy}>
            {busy ? "Starting…" : "Start"}
          </button>
        </div>
        {plan.length ? (
          <ul className="mt-4 space-y-1.5" aria-label="What Deep work will do">
            {plan.map((p) => (
              <li key={p.label} className={`flex items-center gap-2 text-[12px] ${p.by.length ? "text-[color:var(--land-muted)]" : "text-[color:var(--land-faint)]"}`}>
                <StatusDot tone={p.by.length ? "ok" : "idle"} />
                <span className="truncate">
                  {p.label}
                  {p.by.length ? ` · ${p.by.join(", ")}` : " · not connected"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      {error ? <p className="cmd-error mt-2">{error}</p> : null}
    </Section>
  );
}

function GoalsPanel({ command, goals }: { command: CommandController; goals: CommandItemOf<"command.task">[] }) {
  const [target, setTarget] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const hasRun = goals.some((g) => g.data.goal?.metric === "run.distance_km");
  const strava = command.state!.connections.some((c) => c.connectorId === "strava");
  return (
    <Section title="Goals" aside={strava ? "checked by Strava" : undefined}>
      {goals.length ? (
        <ul className="space-y-3">
          {goals.map((g) => {
            const goal = g.data.goal!;
            const pct = Math.min(100, (goal.progress / goal.target) * 100);
            return (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className={g.data.status === "done" ? "text-[color:var(--land-gold-soft)]" : ""}>{g.title}</span>
                  <span className="text-[12px] tabular-nums text-[color:var(--land-faint)]">
                    {goal.progress.toFixed(1)} / {goal.target} {goal.unit}
                  </span>
                </div>
                <div className="cmd-progress mt-2">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!hasRun ? (
        <form
          className={`flex items-center gap-2 ${goals.length ? "mt-4" : ""}`}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(await command.addGoal(Number(target)));
          }}
        >
          <span className="text-[13px] text-[color:var(--land-muted)]">Run</span>
          <input className="cmd-field w-16 text-center tabular-nums" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Kilometres" />
          <span className="text-[13px] text-[color:var(--land-muted)]">km today</span>
          <button type="submit" className="dash-button ml-auto" disabled={command.pending === "goal" || !(Number(target) > 0)}>
            Set
          </button>
        </form>
      ) : null}
      {error ? <p className="cmd-error mt-2">{error}</p> : null}
    </Section>
  );
}

function RunsPanel({ command }: { command: CommandController }) {
  const runs = command.state!.runs.slice(0, 4);
  if (!runs.length) return null;
  return (
    <Section title="Automations" aside="latest runs">
      <ul className="space-y-3">
        {runs.map((run) => (
          <li key={run.id}>
            <p className="flex items-center gap-2 text-[13.5px]">
              <StatusDot tone={run.status === "ok" ? "ok" : run.status === "partial" ? "warn" : "alert"} />
              <span className="truncate">{run.recipeName}</span>
              <span className="ml-auto shrink-0 text-[11.5px] text-[color:var(--land-faint)]">{clock(run.createdAt)}</span>
            </p>
            <p className="mt-0.5 truncate pl-3.5 text-[12px] text-[color:var(--land-faint)]">{run.steps.find((s) => s.status === "ok")?.detail ?? run.trigger}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
