"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ACTION_DEFINITIONS } from "@/lib/command/actions";
import type { CommandItem, CommandItemOf } from "@/lib/command/kinds";
import { connectGoogleServices } from "@/lib/command/google-connect";
import { buildTimeline, type TimelineEntry } from "@/lib/command/timeline";
import { getConnector } from "@/lib/connectors/catalog";
import { ExternalIcon } from "@/components/dashboard/icons";
import { commandApi, viewerTimeZone, type LiveWeather } from "./command-client";
import { clock, countdown, dayLabel, money, relative, sourceName } from "./format";
import { KindIcon, Section, SourceGlyph, StatusDot, useNow } from "./parts";
import type { CommandController } from "./use-command";

type MailItem = CommandItemOf<"command.message">;
type EventItem = CommandItemOf<"command.event">;

type Draft = {
  to: string;
  cc: string;
  subject: string;
  body: string;
  threadId: string | null;
  inReplyTo: string | null;
  reply: boolean;
};

const blankDraft = (): Draft => ({ to: "", cc: "", subject: "", body: "", threadId: null, inReplyTo: null, reply: false });

export function TodayView({ command, onConnections }: { command: CommandController; onConnections: () => void }) {
  const state = command.state!;
  const now = useNow(15_000);
  const timeZone = useMemo(() => viewerTimeZone(), []);
  const timeline = useMemo(() => buildTimeline(state.items, { now: new Date(now), timeZone }), [state.items, now, timeZone]);
  const { goals, anytime } = timeline;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const mail = useMemo(
    () =>
      state.items
        .filter((i): i is MailItem => i.kind === "command.message" && i.data.channel === "email")
        .sort((a, b) => Date.parse(b.data.receivedAt) - Date.parse(a.data.receivedAt))
        .slice(0, 12),
    [state.items],
  );
  const calendarEvents = useMemo(() => monthEvents(state.items, now), [state.items, now]);
  const gmail = state.connections.find((c) => c.connectorId === "gmail") ?? null;
  const calendar = state.connections.find((c) => c.connectorId === "google-calendar") ?? null;
  const canSend = state.connections.some((c) => c.connectorId === "gmail-send" && c.status !== "needs_auth");
  const upcoming = state.items
    .filter((i): i is EventItem => i.kind === "command.event" && i.data.category !== "sky" && Date.parse(i.data.startsAt) > now && !timeline.entries.some((e) => e.item.id === i.id))
    .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt))
    .slice(0, 4);
  const purchases = state.items.filter((i): i is CommandItemOf<"command.purchase"> => i.kind === "command.purchase").slice(0, 4);

  function replyTo(message: MailItem) {
    const subject = message.data.subject.startsWith("Re:") ? message.data.subject : `Re: ${message.data.subject}`;
    setSent(null);
    setDraft({
      to: senderEmail(message.data.from),
      cc: "",
      subject,
      body: "",
      threadId: message.data.threadId ?? null,
      inReplyTo: message.data.rfcMessageId ?? null,
      reply: true,
    });
  }

  return (
    <div className="cmd-today">
      <div className="cmd-overview">
        <WeatherCard />
        <MailCard
          mail={mail}
          connection={gmail}
          canSend={canSend}
          sent={sent}
          now={now}
          onCompose={() => {
            setSent(null);
            setDraft(blankDraft());
          }}
          onReply={replyTo}
          onConnections={onConnections}
        />
      </div>
      <MonthCalendar events={calendarEvents} connection={calendar} now={now} />
      <div className="cmd-today-grid">
        <div className="min-w-0">
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
                {calendar ? null : (
                  <button type="button" className="cmd-link" onClick={() => void connectGoogleServices(["google-calendar"])}>
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
      {draft ? (
        <ComposeMail
          draft={draft}
          canSend={canSend}
          sending={command.pending === "mail"}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSend={async () => {
            const failure = await command.sendMail({
              to: draft.to,
              cc: draft.cc.trim() || undefined,
              subject: draft.subject,
              body: draft.body,
              threadId: draft.threadId,
              inReplyTo: draft.inReplyTo,
            });
            if (!failure) {
              setSent(draft.reply ? `Reply sent to ${draft.to}.` : `Sent to ${draft.to}.`);
              setDraft(null);
            }
            return failure;
          }}
        />
      ) : null}
    </div>
  );
}

function WeatherCard() {
  const [weather, setWeather] = useState<LiveWeather | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    commandApi.weather().then(
      (r) => alive && setWeather(r.signal),
      (e: Error) => {
        if (!alive) return;
        setError(e.message);
        setWeather(null);
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  const details = weather?.data.details;
  const hourly = typeof details?.["hourly"] === "string" ? details["hourly"] : "";
  return (
    <section className="cmd-weather" aria-label="Weather">
      <p className="dash-eyebrow">Weather</p>
      {weather === undefined ? (
        <p className="cmd-empty mt-3">Reading the sky…</p>
      ) : weather ? (
        <>
          <p className="mt-2 text-[13px] text-[color:var(--land-muted)]">{String(details?.["location"] ?? "")}</p>
          <p className="cmd-weather-temp">{weather.data.value}°</p>
          <p className="text-[14px] text-[color:var(--land-muted)]">
            {String(details?.["condition"] ?? "")}
            <span className="text-[color:var(--land-faint)]">
              {" "}
              · H {String(details?.["high"])}° L {String(details?.["low"])}°
            </span>
          </p>
          <Hourly hours={hourly} />
        </>
      ) : (
        <p className="cmd-empty mt-3">{error ?? "Weather is unavailable right now."}</p>
      )}
    </section>
  );
}

function Hourly({ hours }: { hours: string }) {
  if (!hours) return null;
  const parsed = hours.split(",").slice(0, 8).map((h) => {
    const [t, temp, rain] = h.split(":").map(Number);
    return { at: new Date(t! * 1000), temp: temp!, rain: rain! };
  });
  return (
    <ol className="cmd-hours cmd-hours--compact" aria-label="Next hours">
      {parsed.map((h, i) => (
        <li key={i} className="cmd-hour" title={`${h.rain}% chance of rain`}>
          <span className="text-[13px]">{h.temp}°</span>
          <span className="cmd-hour-bar" aria-hidden>
            <span style={{ height: `${Math.max(3, h.rain)}%` }} />
          </span>
          <span className="text-[10.5px] text-[color:var(--land-faint)]">{i === 0 ? "Now" : h.at.toLocaleTimeString(undefined, { hour: "numeric" })}</span>
        </li>
      ))}
    </ol>
  );
}

function MailCard({
  mail,
  connection,
  canSend,
  sent,
  now,
  onCompose,
  onReply,
  onConnections,
}: {
  mail: MailItem[];
  connection: { status: string; lastError: string | null } | null;
  canSend: boolean;
  sent: string | null;
  now: number;
  onCompose: () => void;
  onReply: (message: MailItem) => void;
  onConnections: () => void;
}) {
  const broken = connection && connection.status !== "ok";
  return (
    <section className="cmd-mail" aria-label="Recent mail">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-medium tracking-[-0.01em]">Mail</h3>
        <div className="flex items-center gap-3">
          {sent ? <span className="text-[12px] text-[color:var(--land-gold-soft)]">{sent}</span> : null}
          {connection ? (
            <button type="button" className="cmd-link text-[13px]" onClick={canSend ? onCompose : () => void connectGoogleServices(["gmail-send"])}>
              {canSend ? "Compose" : "Allow sending"}
            </button>
          ) : null}
        </div>
      </div>
      {broken ? <p className="cmd-error mt-2">{connection.lastError ?? "Gmail needs to be connected again."}</p> : null}
      {!connection ? (
        <div className="cmd-connect-empty">
          <p>Recent messages show here once Gmail is connected. Nothing is invented in the meantime.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="dash-button dash-button--gold h-8 px-3 text-[13px]" onClick={() => void connectGoogleServices(["gmail", "gmail-send"])}>
              Connect Gmail
            </button>
            <button type="button" className="cmd-link text-[13px]" onClick={onConnections}>
              All connections
            </button>
          </div>
        </div>
      ) : mail.length === 0 ? (
        <p className="cmd-empty mt-3">No inbox messages from the last week.</p>
      ) : (
        <ul className="mt-1">
          {mail.map((message) => (
            <li key={message.id} className="cmd-mail-row">
              <button type="button" className="cmd-mail-open" onClick={() => onReply(message)}>
                <span className="cmd-mail-from">{senderName(message.data.from)}</span>
                <span className="cmd-mail-subject">{message.data.subject || "(no subject)"}</span>
                <span className="cmd-mail-time">{relative(message.data.receivedAt, now)}</span>
              </button>
              {message.data.url ? <ItemLink href={message.data.url} label={`Open ${message.data.subject || "message"}`} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MonthCalendar({ events, connection, now }: { events: Map<string, EventItem[]>; connection: { status: string; lastError: string | null } | null; now: number }) {
  const days = useMemo(() => buildMonth(now), [now]);
  const broken = connection && connection.status !== "ok";
  return (
    <section className="cmd-calendar" aria-label="Next 30 days">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-medium tracking-[-0.01em]">Next 30 days</h3>
        {connection ? <span className="text-[12px] text-[color:var(--land-faint)]">{[...events.values()].reduce((n, list) => n + list.length, 0)} events</span> : null}
      </div>
      {broken ? <p className="cmd-error mt-2">{connection.lastError ?? "Google Calendar needs to be connected again."}</p> : null}
      {!connection ? (
        <div className="cmd-connect-empty">
          <p>Your events for the next 30 days show here after Google Calendar is connected.</p>
          <button type="button" className="dash-button dash-button--gold mt-3 h-8 px-3 text-[13px]" onClick={() => void connectGoogleServices(["google-calendar"])}>
            Connect Google Calendar
          </button>
        </div>
      ) : (
        <>
          <div className="cmd-month-head" aria-hidden>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="cmd-month" role="grid">
            {days.map((day) => {
              const list = day.inRange ? (events.get(day.key) ?? []) : [];
              return (
                <div key={day.key} role="gridcell" className={`cmd-day ${day.today ? "cmd-day--today" : ""} ${day.inRange ? "" : "cmd-day--pad"}`}>
                  <span className="cmd-day-num">{day.date.getDate()}</span>
                  {list.slice(0, 2).map((event) => (
                    <span key={event.id} className="cmd-day-event" title={event.title}>
                      {event.data.allDay ? "" : `${clock(event.data.startsAt)} `}
                      {event.title}
                    </span>
                  ))}
                  {list.length > 2 ? <span className="cmd-day-more">+{list.length - 2}</span> : null}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function ComposeMail({
  draft,
  canSend,
  sending,
  onChange,
  onClose,
  onSend,
}: {
  draft: Draft;
  canSend: boolean;
  sending: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSend: () => Promise<string | null>;
}) {
  const formId = useId();
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const failure = await onSend();
    if (failure) setError(failure);
  }
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="gap-4 border border-border bg-popover p-6 text-popover-foreground shadow-2xl ring-0 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="font-sans text-[15px] font-medium">
            {draft.reply ? "Reply" : "New message"}
          </DialogTitle>
        </DialogHeader>

        {canSend ? (
          <form className="space-y-3" onSubmit={(e) => void submit(e)}>
            <div className="space-y-1">
              <Label htmlFor={`${formId}-to`} className="cmd-label">To</Label>
              <Input
                id={`${formId}-to`}
                className="cmd-field h-9 rounded-lg border border-border bg-background/50"
                value={draft.to}
                onChange={(e) => onChange({ ...draft, to: e.target.value })}
                required
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${formId}-cc`} className="cmd-label">Cc</Label>
              <Input
                id={`${formId}-cc`}
                className="cmd-field h-9 rounded-lg border border-border bg-background/50"
                value={draft.cc}
                onChange={(e) => onChange({ ...draft, cc: e.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${formId}-subject`} className="cmd-label">Subject</Label>
              <Input
                id={`${formId}-subject`}
                className="cmd-field h-9 rounded-lg border border-border bg-background/50"
                value={draft.subject}
                onChange={(e) => onChange({ ...draft, subject: e.target.value })}
                maxLength={300}
                autoComplete="off"
              />
            </div>
            <Textarea
              aria-label="Message body"
              className="cmd-field min-h-32 w-full rounded-xl border border-border bg-background/50 p-3"
              value={draft.body}
              onChange={(e) => onChange({ ...draft, body: e.target.value })}
              placeholder="Write your message"
              maxLength={50000}
            />
            {error ? (
              <Alert variant="destructive" className="rounded-xl py-2">
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                size="sm"
                className="border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                disabled={sending || !draft.to.trim()}
              >
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="cmd-connect-empty space-y-3">
            <p>Sending needs its own Google permission. Reading your inbox stays on the read-only scope.</p>
            <Button
              type="button"
              size="sm"
              className="border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
              onClick={() => void connectGoogleServices(["gmail-send"])}
            >
              Allow sending
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function senderName(from: string) {
  const named = /^([^<]+)</.exec(from);
  return (named?.[1] ?? from).replace(/"/g, "").trim() || from;
}

function senderEmail(from: string) {
  return /<([^>]+)>/.exec(from)?.[1]?.trim() ?? (from.includes("@") ? from.trim() : "");
}

function dayStamp(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildMonth(now: number) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(today);
  end.setDate(end.getDate() + 29);
  const last = new Date(end);
  last.setDate(last.getDate() + (6 - last.getDay()));
  const days: { key: string; date: Date; today: boolean; inRange: boolean }[] = [];
  for (let cursor = new Date(start); cursor <= last; cursor.setDate(cursor.getDate() + 1)) {
    const date = new Date(cursor);
    days.push({ key: dayStamp(date), date, today: dayStamp(date) === dayStamp(today), inRange: date >= today && date <= end });
  }
  return days;
}

function monthEvents(items: CommandItem[], now: number) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  const grouped = new Map<string, EventItem[]>();
  for (const item of items) {
    if (item.kind !== "command.event" || item.data.category === "sky" || item.data.status === "cancelled") continue;
    const starts = new Date(item.data.startsAt);
    if (Number.isNaN(starts.getTime()) || starts < today || starts >= end) continue;
    const key = dayStamp(starts);
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt));
  return grouped;
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
        <Label htmlFor="cmd-focus-title" className="sr-only">
          What are you working on?
        </Label>
        <Input
          id="cmd-focus-title"
          className="cmd-field h-9 w-full rounded-lg border border-border bg-background/40"
          value={title}
          onChange={(e) => (setTitle(e.target.value), setTarget(null))}
          placeholder="What are you working on?"
          maxLength={200}
          autoComplete="off"
        />
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
              <button
                key={d}
                type="button"
                aria-pressed={minutes === d}
                onClick={() => setMinutes(d)}
                className="!w-auto px-2.5 text-[12px] font-medium"
              >
                {d}m
              </button>
            ))}
          </div>
          <Button
            type="submit"
            size="sm"
            className="ml-auto border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
            disabled={!title.trim() || busy}
          >
            {busy ? "Starting…" : "Start"}
          </Button>
        </div>
        {plan.length ? (
          <ul className="mt-4 space-y-1.5" aria-label="What Deep work will do">
            {plan.map((p) => (
              <li
                key={p.label}
                className={`flex items-center gap-2 text-[12px] ${
                  p.by.length ? "text-[color:var(--land-muted)]" : "text-[color:var(--land-faint)]"
                }`}
              >
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
      {error ? (
        <Alert variant="destructive" className="mt-2 rounded-xl py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
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
                  <span className={g.data.status === "done" ? "text-[color:var(--land-gold-soft)]" : ""}>
                    {g.title}
                  </span>
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
          <Input
            className="cmd-field h-8 w-16 rounded-lg border border-border bg-background/40 text-center tabular-nums"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Kilometres"
          />
          <span className="text-[13px] text-[color:var(--land-muted)]">km today</span>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={command.pending === "goal" || !(Number(target) > 0)}
          >
            Set
          </Button>
        </form>
      ) : null}
      {error ? (
        <Alert variant="destructive" className="mt-2 rounded-xl py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
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
