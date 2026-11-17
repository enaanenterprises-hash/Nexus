"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Circle,
  CircleDot,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Coins,
  Compass,
  Droplets,
  ExternalLink,
  Eye,
  Flag,
  Footprints,
  Gauge,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  ListTodo,
  MapPin,
  Moon,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Triangle,
  Wind,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { connectGoogleService } from "@/lib/command/google-connect";
import type { CommandItemOf } from "@/lib/command/kinds";
import { getConnector } from "@/lib/connectors/catalog";
import { commandApi, type LiveWeather } from "../command-client";
import { clock, dayLabel, relative } from "../format";
import { useNow } from "../parts";
import type { CommandController } from "../use-command";
import { WidgetFrame } from "./frame";

function assignRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}

function PopoverTooltipIcon({
  open,
  label,
  icon,
}: {
  open: boolean;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Tooltip disabled={open}>
      <TooltipTrigger
        render={(tooltipProps) => (
          <PopoverTrigger
            render={(popProps) => (
              <Button
                {...mergeProps<"button">(tooltipProps, popProps)}
                ref={assignRefs(
                  (tooltipProps as { ref?: Ref<HTMLButtonElement> }).ref,
                  (popProps as { ref?: Ref<HTMLButtonElement> }).ref,
                )}
                type="button"
                size="icon-xs"
                variant="ghost"
                className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                aria-label={label}
              >
                {icon}
              </Button>
            )}
          />
        )}
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

type WidgetProps = {
  command: CommandController;
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onRemove: () => void;
  onConnections: () => void;
  style?: CSSProperties;
};

type TempUnit = "C" | "F";
const TEMP_UNIT_KEY = "nexus:wx-unit.v1";

function readTempUnit(): TempUnit {
  if (typeof window === "undefined") return "C";
  try {
    return window.localStorage.getItem(TEMP_UNIT_KEY) === "F" ? "F" : "C";
  } catch {
    return "C";
  }
}

function useTempUnit() {
  const unit = useSyncExternalStore<TempUnit>(
    (cb) => {
      const onStorage = (e: StorageEvent) => {
        if (e.key === TEMP_UNIT_KEY) cb();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener("nexus:wx-unit", cb);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("nexus:wx-unit", cb);
      };
    },
    readTempUnit,
    () => "C",
  );
  const toggle = () => {
    const next: TempUnit = unit === "C" ? "F" : "C";
    try {
      window.localStorage.setItem(TEMP_UNIT_KEY, next);
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(new Event("nexus:wx-unit"));
  };
  return { unit, toggle };
}

function formatTemp(c: number, unit: TempUnit) {
  return unit === "F" ? Math.round((c * 9) / 5 + 32) : Math.round(c);
}

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
    const availability = command.state!.availability?.[connectorId];
    const unconfigured = availability && !availability.connectable;
    const quick =
      manifest?.auth.type === "none" &&
      !(manifest.settings ?? []).some((s) => s.type === "location" || s.key === "urls");
    return (
      <div className="cmd-widget-empty">
        <p className="font-medium text-foreground/90">{manifest?.name ?? "This service"} isn&apos;t connected yet</p>
        {unconfigured ? (
          <p className="text-[11.5px] text-muted-foreground">
            Server needs{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
              {availability.missing.join(", ")}
            </code>
          </p>
        ) : manifest?.description ? (
          <p className="line-clamp-2 max-w-[260px] text-[11.5px] text-muted-foreground">
            {manifest.description}
          </p>
        ) : null}
        {google ? (
          unconfigured ? (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={onConnections}>
              View setup in Connections
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="w-fit border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
              onClick={() => void connectGoogleService(connectorId)}
            >
              Connect {manifest?.name}
            </Button>
          )
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={onConnections}
          >
            Set up in Connections
          </Button>
        )}
      </div>
    );
  }
  if (connection.status === "needs_auth") {
    const google = manifest?.auth.type === "oauth" && manifest.auth.provider === "google";
    return (
      <div className="cmd-widget-empty">
        <p>{connection.lastError ?? `${manifest?.name} needs to be connected again.`}</p>
        {scope ? <p className="cmd-scope">{scope}</p> : null}
        {google ? (
          <Button
            type="button"
            size="sm"
            className="w-fit border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
            onClick={() => void connectGoogleService(connectorId)}
          >
            Reconnect {manifest?.name}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={onConnections}>
            Open Connections
          </Button>
        )}
      </div>
    );
  }
  return (
    <>
      {connection.status !== "ok" && connection.lastError ? (
        <Alert variant="destructive" className="mb-2 rounded-xl py-1.5">
          <AlertDescription className="text-xs">{connection.lastError}</AlertDescription>
        </Alert>
      ) : null}
      {children}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar (2×2 full-month Google Calendar → Full-page Calendar when expanded) */
/* -------------------------------------------------------------------------- */

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + days);
  return localDayKey(dt);
}

function eventDayKeys(event: CommandItemOf<"command.event">): string[] {
  const start = new Date(event.data.startsAt);
  if (Number.isNaN(start.getTime())) return [];
  const startKey = localDayKey(start);
  if (!event.data.endsAt) return [startKey];
  const endMs = Date.parse(event.data.endsAt);
  if (!Number.isFinite(endMs) || endMs <= start.getTime()) return [startKey];
  // Subtract 1ms so midnight-ending all-day events stay on their true final day
  const endDate = new Date(endMs - 1);
  const endKey = localDayKey(endDate);
  if (endKey <= startKey) return [startKey];
  const keys = [startKey];
  let cursor = startKey;
  for (let i = 0; i < 31 && cursor < endKey; i++) {
    cursor = addDaysToKey(cursor, 1);
    keys.push(cursor);
  }
  return keys;
}

function shortClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).replace(/\s?(AM|PM|a\.m\.|p\.m\.)/i, (m) =>
    m.toLowerCase().includes("p") ? "p" : "a",
  );
}

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function CalendarWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const now = useNow(60_000);
  const todayKey = useMemo(() => localDayKey(new Date(now)), [now]);

  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDayKey, setSelectedDayKey] = useState<string>(() => localDayKey(new Date()));
  const [openCreate, setOpenCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [startLocal, setStartLocal] = useState(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return toLocalDateTimeInput(d);
  });
  const [durationMin, setDurationMin] = useState(60);
  const [formError, setFormError] = useState<string | null>(null);

  const calConn = command.state!.connections.find((c) => c.connectorId === "google-calendar");

  const allEvents = useMemo(
    () =>
      command.state!.items
        .filter(
          (item): item is CommandItemOf<"command.event"> =>
            item.kind === "command.event" &&
            item.data.connectorId === "google-calendar" &&
            item.data.status !== "cancelled",
        )
        .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt)),
    [command.state],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CommandItemOf<"command.event">[]>();
    for (const ev of allEvents) {
      for (const k of eventDayKeys(ev)) {
        const list = map.get(k);
        if (list) list.push(ev);
        else map.set(k, [ev]);
      }
    }
    return map;
  }, [allEvents]);

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.year, viewMonth.month, 1);
    const firstWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
    const totalCells = firstWeekday + daysInMonth > 35 ? 42 : 35;
    return Array.from({ length: totalCells }, (_, idx) => {
      const date = new Date(viewMonth.year, viewMonth.month, idx - firstWeekday + 1);
      const key = localDayKey(date);
      return {
        key,
        dayNum: date.getDate(),
        inMonth: date.getMonth() === viewMonth.month,
        isToday: key === todayKey,
        events: eventsByDay.get(key) ?? [],
      };
    });
  }, [viewMonth, todayKey, eventsByDay]);

  const monthLabel = useMemo(
    () =>
      new Date(viewMonth.year, viewMonth.month, 1).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [viewMonth],
  );

  const selectedDayEvents = useMemo(() => eventsByDay.get(selectedDayKey) ?? [], [eventsByDay, selectedDayKey]);

  const selectedDayLabel = useMemo(() => {
    const [y, m, d] = selectedDayKey.split("-").map(Number);
    return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [selectedDayKey]);

  function shiftMonth(delta: number) {
    setViewMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function jumpToToday() {
    const d = new Date();
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
    setSelectedDayKey(localDayKey(d));
  }

  function selectDay(key: string) {
    setSelectedDayKey(key);
    const timePart = startLocal.split("T")[1] || "09:00";
    setStartLocal(`${key}T${timePart}`);
  }

  async function submitEvent(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setFormError(null);
    const startMs = Date.parse(startLocal);
    if (!Number.isFinite(startMs)) {
      setFormError("Pick a valid date and time.");
      return;
    }
    const err = await command.createEvent({
      title: title.trim(),
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(startMs + durationMin * 60_000).toISOString(),
    });
    if (err) {
      setFormError(err);
      return;
    }
    setTitle("");
    setOpenCreate(false);
  }

  const monthCount = useMemo(
    () => monthCells.filter((c) => c.inMonth).reduce((sum, c) => sum + c.events.length, 0),
    [monthCells],
  );

  const actions =
    calConn && calConn.status !== "needs_auth" ? (
      <>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={jumpToToday}
            className="rounded px-2 py-0.5 font-medium text-foreground/90 transition-colors hover:bg-background/60"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
          >
            ›
          </button>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                onClick={() => void command.sync()}
                disabled={command.syncing}
                aria-label="Sync Google Calendar"
              >
                <RefreshCw className={`size-3 ${command.syncing ? "animate-spin" : ""}`} />
              </Button>
            }
          />
          <TooltipContent side="bottom">Sync Google Calendar</TooltipContent>
        </Tooltip>

        <Popover open={openCreate} onOpenChange={setOpenCreate}>
          <PopoverTooltipIcon
            open={openCreate}
            label="Schedule event"
            icon={<Plus className="size-3.5" />}
          />
          <PopoverContent align="end" sideOffset={6} className="w-72 rounded-xl border border-border bg-popover p-3.5 shadow-xl">
            <form onSubmit={(e) => void submitEvent(e)} className="space-y-2.5">
              <p className="text-[12.5px] font-medium text-foreground">New Google Calendar event</p>
              <div className="space-y-1">
                <Label htmlFor="cal-new-title" className="text-[11px] text-muted-foreground">
                  Title
                </Label>
                <Input
                  id="cal-new-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Deep work, sync, review…"
                  className="h-8 rounded-lg text-[12.5px]"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cal-new-start" className="text-[11px] text-muted-foreground">
                  Start
                </Label>
                <Input
                  id="cal-new-start"
                  type="datetime-local"
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className="h-8 rounded-lg text-[12px]"
                  required
                />
              </div>
              <div className="flex items-center gap-1.5">
                {[30, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDurationMin(m)}
                    className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                      durationMin === m
                        ? "border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/15 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              {formError ? <p className="text-[11px] text-destructive">{formError}</p> : null}
              <Button
                type="submit"
                size="sm"
                className="w-full border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                disabled={command.pending === "calendar:create" || !title.trim()}
              >
                {command.pending === "calendar:create" ? "Scheduling…" : "Add to Google Calendar"}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </>
    ) : undefined;

  return (
    <WidgetFrame
      title={monthLabel}
      icon={<Calendar className="size-3.5 text-[color:var(--land-gold)]" />}
      hint={calConn ? `${monthCount} events` : "Google Calendar"}
      actions={actions}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="google-calendar" command={command} onConnections={onConnections}>
        {!expanded ? (
          /* ——— 2×2 Live Monthly Calendar Board ——— */
          <div className="flex h-full min-h-0 flex-col gap-1.5">
            <div className="grid shrink-0 grid-cols-7 gap-1 text-center text-[10px] font-medium tracking-wider text-muted-foreground/80 uppercase">
              {WEEKDAYS_SHORT.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div
              className={`grid min-h-0 flex-1 grid-cols-7 gap-1 ${
                monthCells.length > 35 ? "grid-rows-6" : "grid-rows-5"
              }`}
            >
              {monthCells.map((cell) => {
                const isSelected = cell.key === selectedDayKey;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    data-no-expand="true"
                    onClick={() => selectDay(cell.key)}
                    onDoubleClick={() => {
                      selectDay(cell.key);
                      onExpand?.();
                    }}
                    className={`group/day flex min-h-0 flex-col overflow-hidden rounded-lg border px-1.5 py-1 text-left transition-colors ${
                      isSelected
                        ? "border-[color:var(--land-gold)]/65 bg-[color:var(--land-gold)]/12"
                        : cell.isToday
                          ? "border-[color:var(--land-gold)]/35 bg-background/45"
                          : cell.inMonth
                            ? "border-border/45 bg-background/20 hover:border-border hover:bg-muted/35"
                            : "border-transparent bg-transparent opacity-40 hover:opacity-70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        suppressHydrationWarning
                        className={`inline-flex size-4.5 items-center justify-center rounded-full text-[10.5px] leading-none tabular-nums ${
                          cell.isToday
                            ? "bg-[color:var(--land-gold)] font-bold text-[#09090b]"
                            : isSelected
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground/85"
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {cell.events.length > 2 ? (
                        <span className="text-[9px] font-medium text-muted-foreground tabular-nums">
                          +{cell.events.length - 2}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                      {cell.events.slice(0, 2).map((ev) => {
                        const isFocus = ev.data.category === "focus";
                        return (
                          <div
                            key={`${cell.key}-${ev.id}`}
                            className={`flex items-center gap-1 truncate rounded px-1 py-px text-[9.5px] leading-tight ${
                              isFocus
                                ? "bg-[color:var(--land-gold)]/18 text-[color:var(--land-gold)]"
                                : "bg-muted/70 text-foreground/90"
                            }`}
                            title={ev.title}
                          >
                            {!ev.data.allDay ? (
                              <span suppressHydrationWarning className="shrink-0 opacity-70 tabular-nums">
                                {shortClock(ev.data.startsAt)}
                              </span>
                            ) : null}
                            <span className="truncate font-medium">{ev.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected day compact footer */}
            <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/35 px-2.5 py-1 text-[11px]">
              <div className="flex min-w-0 items-center gap-2">
                <span suppressHydrationWarning className="shrink-0 font-semibold text-foreground">
                  {selectedDayKey === todayKey ? "Today" : selectedDayLabel}
                </span>
                <span className="truncate text-muted-foreground">
                  {selectedDayEvents.length === 0
                    ? "No events scheduled"
                    : selectedDayEvents
                        .slice(0, 2)
                        .map((e) => (e.data.allDay ? e.title : `${shortClock(e.data.startsAt)} ${e.title}`))
                        .join(" · ")}
                </span>
              </div>
              {onExpand ? (
                <button
                  type="button"
                  onClick={onExpand}
                  className="shrink-0 text-[10.5px] font-medium text-[color:var(--land-gold)] hover:underline"
                >
                  Full view →
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          /* ——— Expanded Full-Page Calendar & Selected Day Inspector ——— */
          <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
            {/* Full-month Calendar Matrix */}
            <div className="flex min-h-0 flex-col gap-2">
              <div className="grid shrink-0 grid-cols-7 gap-1.5 text-center text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {WEEKDAYS_SHORT.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>

              <div
                className={`grid min-h-0 flex-1 grid-cols-7 gap-1.5 ${
                  monthCells.length > 35 ? "grid-rows-6" : "grid-rows-5"
                }`}
              >
                {monthCells.map((cell) => {
                  const isSelected = cell.key === selectedDayKey;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => selectDay(cell.key)}
                      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border p-2 text-left transition-colors ${
                        isSelected
                          ? "border-[color:var(--land-gold)]/70 bg-[color:var(--land-gold)]/10"
                          : cell.isToday
                            ? "border-[color:var(--land-gold)]/40 bg-background/45"
                            : cell.inMonth
                              ? "border-border/55 bg-background/25 hover:border-border hover:bg-muted/30"
                              : "border-border/25 bg-transparent opacity-40 hover:opacity-75"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          suppressHydrationWarning
                          className={`inline-flex size-6 items-center justify-center rounded-full text-[12px] tabular-nums ${
                            cell.isToday
                              ? "bg-[color:var(--land-gold)] font-bold text-[#09090b]"
                              : isSelected
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/90"
                          }`}
                        >
                          {cell.dayNum}
                        </span>
                        {cell.events.length > 3 ? (
                          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                            +{cell.events.length - 3}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
                        {cell.events.slice(0, 3).map((ev) => {
                          const startMs = Date.parse(ev.data.startsAt);
                          const endMs = ev.data.endsAt ? Date.parse(ev.data.endsAt) : startMs + 60 * 60_000;
                          const live = now >= startMs && now < endMs;
                          return (
                            <div
                              key={`${cell.key}-full-${ev.id}`}
                              className={`flex items-center gap-1.5 truncate rounded-md border px-1.5 py-0.5 text-[11px] leading-tight ${
                                live
                                  ? "border-[color:var(--land-gold)]/60 bg-[color:var(--land-gold)]/20 text-foreground"
                                  : ev.data.category === "focus"
                                    ? "border-[color:var(--land-gold)]/30 bg-[color:var(--land-gold)]/10 text-[color:var(--land-gold)]"
                                    : "border-border/40 bg-muted/60 text-foreground/90"
                              }`}
                              title={ev.title}
                            >
                              {!ev.data.allDay ? (
                                <span suppressHydrationWarning className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                                  {shortClock(ev.data.startsAt)}
                                </span>
                              ) : null}
                              <span className="truncate font-medium">{ev.title}</span>
                            </div>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Day Agenda + Inline Event Creator */}
            <div className="flex min-h-0 flex-col gap-3 rounded-2xl border border-border/60 bg-background/35 p-4">
              <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-3">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
                    {selectedDayKey === todayKey ? "Today's Schedule" : "Selected Day"}
                  </p>
                  <h4 suppressHydrationWarning className="mt-0.5 truncate text-[16px] font-semibold text-foreground">
                    {selectedDayLabel}
                  </h4>
                </div>
                <Badge variant="secondary" className="shrink-0 text-[11px] tabular-nums">
                  {selectedDayEvents.length} {selectedDayEvents.length === 1 ? "event" : "events"}
                </Badge>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {selectedDayEvents.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-muted-foreground">
                    No Google Calendar events on this day.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedDayEvents.map((event) => {
                      const startMs = Date.parse(event.data.startsAt);
                      const endMs = event.data.endsAt ? Date.parse(event.data.endsAt) : startMs + 60 * 60_000;
                      const live = now >= startMs && now < endMs;
                      return (
                        <li
                          key={`agenda-${event.id}`}
                          className={`rounded-xl border p-3 ${
                            live
                              ? "border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/10"
                              : "border-border/55 bg-background/35"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              suppressHydrationWarning
                              className="text-[11.5px] font-medium text-[color:var(--land-gold)] tabular-nums"
                            >
                              {event.data.allDay
                                ? "All day"
                                : `${clock(event.data.startsAt)} – ${clock(new Date(endMs).toISOString())}`}
                            </span>
                            {event.data.url ? (
                              <a
                                href={event.data.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Open in Google Calendar"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="size-3.5" />
                              </a>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[13.5px] font-medium text-foreground">{event.title}</p>
                          {event.data.location ? (
                            <p className="mt-1 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                              <MapPin className="size-3 shrink-0" />
                              <span className="truncate">{event.data.location}</span>
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <form onSubmit={(e) => void submitEvent(e)} className="shrink-0 space-y-2 border-t border-border/50 pt-3">
                <p className="text-[11.5px] font-medium text-foreground">Quick add to Google Calendar</p>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`Add event on ${selectedDayLabel.split(",")[0]}…`}
                  aria-label="New calendar event title"
                  className="h-8 rounded-lg text-[12.5px]"
                />
                <div className="flex items-center gap-1.5">
                  <Input
                    type="datetime-local"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    aria-label="Event start"
                    className="h-8 flex-1 rounded-lg text-[11.5px]"
                  />
                  <Button
                    type="submit"
                    size="xs"
                    disabled={command.pending === "calendar:create" || !title.trim()}
                    className="h-8 border border-[color:var(--land-gold)]/55 bg-[color:var(--land-gold)]/18 px-3 text-[12px] text-[color:var(--land-ink)] hover:bg-[color:var(--land-gold)]/28"
                  >
                    {command.pending === "calendar:create" ? "Saving…" : "Add"}
                  </Button>
                </div>
                {formError ? <p className="text-[11px] text-destructive">{formError}</p> : null}
              </form>
            </div>
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Weather (1×1 preview → Atmospheric Observatory when expanded)              */
/* -------------------------------------------------------------------------- */

function WeatherIcon({
  condition,
  isDay = true,
  className = "size-3.5",
}: {
  condition: string;
  isDay?: boolean;
  className?: string;
}) {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return <CloudLightning className={className} />;
  if (c.includes("snow")) return <CloudSnow className={className} />;
  if (c.includes("rain") || c.includes("shower")) return <CloudRain className={className} />;
  if (c.includes("drizzle")) return <CloudDrizzle className={className} />;
  if (c.includes("fog")) return <CloudFog className={className} />;
  if (c.includes("partly")) return <CloudSun className={className} />;
  if (c.includes("overcast") || c.includes("cloud")) return <Cloud className={className} />;
  return isDay ? <Sun className={className} /> : <Moon className={className} />;
}

function wmoCodeCondition(code: number): string {
  if (code >= 95) return "Storm";
  if (code >= 85 || (code >= 71 && code <= 77)) return "Snow";
  if (code >= 80 || (code >= 61 && code <= 67)) return "Rain";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code === 45 || code === 48) return "Fog";
  if (code === 3) return "Overcast";
  if (code === 2) return "Partly cloudy";
  if (code === 1) return "Mostly clear";
  return "Clear";
}

function weatherAtmosphere(condition: string, isDay: boolean): { glow: string; accent: string } {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) {
    return {
      glow: "radial-gradient(circle at 86% 12%, rgba(168, 85, 247, 0.22), rgba(240, 181, 74, 0.08) 42%, transparent 72%)",
      accent: "text-violet-300",
    };
  }
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) {
    return {
      glow: "radial-gradient(circle at 86% 12%, rgba(56, 189, 248, 0.2), rgba(56, 189, 248, 0.05) 45%, transparent 74%)",
      accent: "text-sky-300",
    };
  }
  if (c.includes("snow")) {
    return {
      glow: "radial-gradient(circle at 86% 12%, rgba(186, 230, 253, 0.22), rgba(147, 197, 253, 0.05) 45%, transparent 74%)",
      accent: "text-sky-200",
    };
  }
  if (c.includes("cloud") || c.includes("overcast") || c.includes("fog")) {
    return {
      glow: "radial-gradient(circle at 86% 12%, rgba(148, 163, 184, 0.17), transparent 70%)",
      accent: "text-slate-300",
    };
  }
  if (!isDay) {
    return {
      glow: "radial-gradient(circle at 86% 12%, rgba(99, 102, 241, 0.22), rgba(240, 181, 74, 0.05) 45%, transparent 72%)",
      accent: "text-indigo-200",
    };
  }
  return {
    glow: "radial-gradient(circle at 86% 12%, rgba(240, 181, 74, 0.24), rgba(240, 181, 74, 0.05) 46%, transparent 74%)",
    accent: "text-[color:var(--land-gold)]",
  };
}

function compassDirection(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8] ?? "N";
}

function uvSeverity(uv: number): string {
  if (uv >= 8) return "Very high";
  if (uv >= 6) return "High";
  if (uv >= 3) return "Moderate";
  return "Low";
}

export function WeatherWidget({
  expanded = false,
  onExpand,
  onCollapse,
  onRemove,
  style,
}: {
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onRemove: () => void;
  style?: CSSProperties;
}) {
  const { unit, toggle } = useTempUnit();
  const nowMs = useNow(60_000);
  const [weather, setWeather] = useState<LiveWeather | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    commandApi.weather().then(
      (result) => {
        if (alive) {
          setWeather(result.signal);
          setError(null);
        }
      },
      (reason: Error) => {
        if (!alive) return;
        setError(reason.message);
        setWeather(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [reloadNonce]);

  const details = weather?.data.details;
  const condition = String(details?.["condition"] ?? "");
  const isDay = details?.["isDay"] !== 0;
  const atmosphere = weatherAtmosphere(condition, isDay);

  const hourlyEntries = useMemo(() => {
    const raw = typeof details?.["hourly"] === "string" ? details["hourly"] : "";
    return raw
      .split(",")
      .filter(Boolean)
      .map((entry) => {
        const [t, tempC, pop, code, wind, uv, feelsC] = entry.split(":").map(Number);
        return {
          t: t ?? 0,
          tempC: tempC ?? 0,
          pop: pop ?? 0,
          code: code ?? 0,
          wind: wind ?? Number(details?.["windKmh"] ?? 0),
          uv: uv ?? Number(details?.["uvIndex"] ?? 0),
          feelsC: feelsC ?? tempC ?? 0,
        };
      });
  }, [details]);

  const dailyEntries = useMemo(() => {
    const raw = typeof details?.["daily"] === "string" ? details["daily"] : "";
    return raw
      .split(",")
      .filter(Boolean)
      .map((entry) => {
        const [t, code, maxC, minC, pop, uv, wind] = entry.split(":").map(Number);
        return {
          t: t ?? 0,
          code: code ?? 0,
          maxC: maxC ?? 0,
          minC: minC ?? 0,
          pop: pop ?? 0,
          uv: uv ?? 0,
          wind: wind ?? 0,
        };
      });
  }, [details]);

  const previewHours = hourlyEntries.slice(0, 5);
  const expandedHours = hourlyEntries.slice(0, 12);
  const currentTemp = weather?.data.value ?? 0;
  const highC = Number(details?.["high"] ?? currentTemp);
  const lowC = Number(details?.["low"] ?? currentTemp);
  const feelsC = Number(details?.["feelsLike"] ?? currentTemp);
  const windKmh = Number(details?.["windKmh"] ?? 0);
  const windDir = Number(details?.["windDir"] ?? 0);
  const gustsKmh = Number(details?.["gustsKmh"] ?? windKmh);
  const humidity = Number(details?.["humidity"] ?? 0);
  const rainChance = Number(details?.["rainChance"] ?? 0);
  const uvIndex = Number(details?.["uvIndex"] ?? 0);
  const pressureHpa = Number(details?.["pressureHpa"] ?? 1013);
  const cloudCover = Number(details?.["cloudCover"] ?? 0);
  const sunriseIso = typeof details?.["sunrise"] === "string" ? details["sunrise"] : null;
  const sunsetIso = typeof details?.["sunset"] === "string" ? details["sunset"] : null;

  const actions = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="size-6 rounded-md text-[10.5px] font-semibold text-muted-foreground hover:text-foreground"
        onClick={toggle}
        aria-label={`Switch temperature to °${unit === "C" ? "F" : "C"}`}
      >
        °{unit}
      </Button>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-6 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setReloadNonce((n) => n + 1)}
              aria-label="Refresh weather"
            >
              <RefreshCw className="size-3" />
            </Button>
          }
        />
        <TooltipContent side="bottom">Refresh weather</TooltipContent>
      </Tooltip>
    </>
  );

  const cardStyle: CSSProperties = {
    ...style,
    ...(weather ? { backgroundImage: atmosphere.glow } : {}),
  };

  return (
    <WidgetFrame
      title="Weather"
      icon={<WeatherIcon condition={condition} isDay={isDay} />}
      hint={weather ? String(details?.["location"] ?? "") : undefined}
      actions={actions}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={cardStyle}
    >
      {weather === undefined ? <p className="cmd-empty py-5 text-center">Reading the sky…</p> : null}
      {weather === null ? <p className="cmd-empty py-5 text-center">{error ?? "Weather is unavailable."}</p> : null}

      {weather && !expanded ? (
        <div className="flex h-full min-h-0 flex-col justify-between gap-2 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-2">
                <p className="text-[36px] leading-none font-light tracking-[-0.04em] text-foreground tabular-nums">
                  {formatTemp(currentTemp, unit)}°
                </p>
                <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10.5px] font-medium text-foreground/90">
                  {condition || "Clear"}
                </span>
              </div>
              <p className="mt-1.5 text-[11.5px] text-muted-foreground tabular-nums">
                H {formatTemp(highC, unit)}° · L {formatTemp(lowC, unit)}° · Feels {formatTemp(feelsC, unit)}°
              </p>
            </div>
            <span className={`cmd-wx-float mt-0.5 shrink-0 ${atmosphere.accent}`}>
              <WeatherIcon condition={condition} isDay={isDay} className="size-6" />
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border/50 bg-background/30 px-2.5 py-1.5 text-[11px]">
            <div>
              <span className="block text-[9.5px] tracking-wide text-muted-foreground uppercase">Wind</span>
              <span className="font-medium tabular-nums">{windKmh} km/h</span>
            </div>
            <div>
              <span className="block text-[9.5px] tracking-wide text-muted-foreground uppercase">Rain</span>
              <span className="font-medium tabular-nums">{rainChance}%</span>
            </div>
            <div>
              <span className="block text-[9.5px] tracking-wide text-muted-foreground uppercase">Humidity</span>
              <span className="font-medium tabular-nums">{humidity}%</span>
            </div>
          </div>

          <ol className="cmd-wx-hours mt-0">
            {previewHours.map((hour, index) => {
              const at = new Date(hour.t * 1000);
              return (
                <li key={index} className="rounded-lg border border-border/40 bg-background/25 py-1">
                  <span suppressHydrationWarning className="text-[10px] text-muted-foreground">
                    {index === 0 ? "Now" : at.toLocaleTimeString(undefined, { hour: "numeric" })}
                  </span>
                  <WeatherIcon
                    condition={wmoCodeCondition(hour.code)}
                    isDay={isDay}
                    className={`size-3 ${atmosphere.accent}`}
                  />
                  <span className="text-[11px] font-medium tabular-nums">
                    {formatTemp(hour.tempC, unit)}°
                  </span>
                  {hour.pop >= 15 ? (
                    <span className="text-[9.5px] text-sky-300 tabular-nums">{hour.pop}%</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {weather && expanded ? (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
          {/* Hero Conditions + Sun Arc */}
          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border/65 bg-background/35 p-4 sm:p-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="flex items-center gap-4 sm:gap-5">
              <div className={`cmd-wx-float flex size-16 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-background/45 ${atmosphere.accent}`}>
                <WeatherIcon condition={condition} isDay={isDay} className="size-9" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="text-[48px] leading-none font-light tracking-[-0.045em] text-foreground tabular-nums sm:text-[56px]">
                    {formatTemp(currentTemp, unit)}°{unit}
                  </span>
                  <span className="rounded-full border border-border/60 bg-muted/45 px-2.5 py-0.5 text-[12px] font-medium text-foreground">
                    {condition}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">
                  {String(details?.["location"] ?? "Local")} · Feels like{" "}
                  <span className="font-medium text-foreground">{formatTemp(feelsC, unit)}°</span> · H{" "}
                  <span className="font-medium text-foreground">{formatTemp(highC, unit)}°</span> / L{" "}
                  <span className="font-medium text-foreground">{formatTemp(lowC, unit)}°</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-2.5 rounded-xl border border-border/55 bg-background/35 px-4 py-3">
              <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Sunrise className="size-3.5 text-[color:var(--land-gold)]" />
                  <span suppressHydrationWarning className="tabular-nums">
                    {sunriseIso ? clock(sunriseIso) : "—"}
                  </span>
                </span>
                <span className="text-[10.5px] tracking-wider uppercase">Daylight</span>
                <span className="inline-flex items-center gap-1.5">
                  <Sunset className="size-3.5 text-amber-400" />
                  <span suppressHydrationWarning className="tabular-nums">
                    {sunsetIso ? clock(sunsetIso) : "—"}
                  </span>
                </span>
              </div>
              {(() => {
                const startMs = sunriseIso ? Date.parse(sunriseIso) : 0;
                const endMs = sunsetIso ? Date.parse(sunsetIso) : 0;
                const pct =
                  startMs && endMs && endMs > startMs
                    ? Math.max(0, Math.min(100, Math.round(((nowMs - startMs) / (endMs - startMs)) * 100)))
                    : 50;
                return (
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/70">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-500/70 via-[color:var(--land-gold)] to-amber-300/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                );
              })()}
              <p suppressHydrationWarning className="text-[11.5px] text-muted-foreground">
                {details?.["nextRain"]
                  ? `Next rain window around ${clock(String(details["nextRain"]))}.`
                  : "No heavy rain expected over the next 12 hours."}
              </p>
            </div>
          </div>

          {/* 6 Telemetry Detail Tiles */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-muted-foreground uppercase">
                <Sun className="size-3.5 text-[color:var(--land-gold)]" />
                <span>UV Index</span>
              </div>
              <p className="mt-1.5 text-[20px] font-medium text-foreground tabular-nums">{uvIndex}</p>
              <p className="text-[11px] text-muted-foreground">{uvSeverity(uvIndex)}</p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-muted-foreground uppercase">
                <Wind className="size-3.5 text-sky-300" />
                <span>Wind</span>
              </div>
              <p className="mt-1.5 text-[20px] font-medium text-foreground tabular-nums">
                {windKmh} <span className="text-[12px] font-normal text-muted-foreground">km/h</span>
              </p>
              <p className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                <Compass className="size-3" />
                {compassDirection(windDir)} · Gusts {gustsKmh} km/h
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-muted-foreground uppercase">
                <Droplets className="size-3.5 text-sky-400" />
                <span>Rain &amp; Moisture</span>
              </div>
              <p className="mt-1.5 text-[20px] font-medium text-foreground tabular-nums">{rainChance}%</p>
              <p className="text-[11px] text-muted-foreground tabular-nums">Humidity {humidity}%</p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-muted-foreground uppercase">
                <Thermometer className="size-3.5 text-amber-300" />
                <span>Feels Like</span>
              </div>
              <p className="mt-1.5 text-[20px] font-medium text-foreground tabular-nums">
                {formatTemp(feelsC, unit)}°{unit}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {feelsC < currentTemp ? "Cooler with wind" : feelsC > currentTemp ? "Warmer than air" : "Matches actual"}
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-muted-foreground uppercase">
                <Gauge className="size-3.5 text-emerald-300" />
                <span>Pressure</span>
              </div>
              <p className="mt-1.5 text-[20px] font-medium text-foreground tabular-nums">
                {pressureHpa} <span className="text-[12px] font-normal text-muted-foreground">hPa</span>
              </p>
              <p className="text-[11px] text-muted-foreground">
                {pressureHpa >= 1020 ? "High ridge" : pressureHpa <= 1005 ? "Low system" : "Steady"}
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-background/30 p-3">
              <div className="flex items-center gap-1.5 text-[10.5px] tracking-wide text-muted-foreground uppercase">
                <Eye className="size-3.5 text-slate-300" />
                <span>Cloud Cover</span>
              </div>
              <p className="mt-1.5 text-[20px] font-medium text-foreground tabular-nums">{cloudCover}%</p>
              <p className="text-[11px] text-muted-foreground">
                {cloudCover < 25 ? "Clear skies" : cloudCover < 65 ? "Broken clouds" : "Dense cover"}
              </p>
            </div>
          </div>

          {/* 12-Hour Temperature Curve + Hourly Timeline */}
          {expandedHours.length > 0 ? (
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-[12.5px] font-semibold tracking-wide text-foreground/90 uppercase">
                  Next 12 Hours
                </h4>
                <span className="text-[11.5px] text-muted-foreground">Temperature, rain chance &amp; wind</span>
              </div>
              {(() => {
                const temps = expandedHours.map((h) => h.tempC);
                const minT = Math.min(...temps);
                const maxT = Math.max(...temps);
                const span = Math.max(1, maxT - minT);
                const points = expandedHours
                  .map((h, i) => {
                    const x = expandedHours.length === 1 ? 50 : (i / (expandedHours.length - 1)) * 100;
                    const y = 32 - ((h.tempC - minT) / span) * 24;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(" ");
                return (
                  <svg viewBox="0 0 100 38" preserveAspectRatio="none" className="mb-3 h-10 w-full overflow-visible">
                    <polyline
                      fill="none"
                      stroke="var(--land-gold)"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      points={points}
                    />
                  </svg>
                );
              })()}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
                {expandedHours.map((hour, index) => {
                  const at = new Date(hour.t * 1000);
                  return (
                    <div
                      key={index}
                      className="flex flex-col items-center gap-1 rounded-xl border border-border/45 bg-background/30 px-1.5 py-2 text-center"
                    >
                      <span suppressHydrationWarning className="text-[10.5px] text-muted-foreground">
                        {index === 0 ? "Now" : at.toLocaleTimeString(undefined, { hour: "numeric" })}
                      </span>
                      <WeatherIcon
                        condition={wmoCodeCondition(hour.code)}
                        isDay={isDay}
                        className={`size-4 ${atmosphere.accent}`}
                      />
                      <span className="text-[13px] font-medium text-foreground tabular-nums">
                        {formatTemp(hour.tempC, unit)}°
                      </span>
                      <span className="text-[10px] text-sky-300/90 tabular-nums">{hour.pop}%</span>
                      <span className="text-[9.5px] text-muted-foreground tabular-nums">{hour.wind} km/h</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* 5-Day Forecast */}
          {dailyEntries.length > 0 ? (
            <div className="rounded-2xl border border-border/60 bg-background/30 p-4">
              <h4 className="mb-2.5 text-[12.5px] font-semibold tracking-wide text-foreground/90 uppercase">
                5-Day Outlook
              </h4>
              {(() => {
                const weekMin = Math.min(...dailyEntries.map((d) => d.minC));
                const weekMax = Math.max(...dailyEntries.map((d) => d.maxC));
                const weekSpan = Math.max(1, weekMax - weekMin);
                return (
                  <ul className="divide-y divide-border/45">
                    {dailyEntries.map((d, idx) => {
                      const leftPct = Math.round(((d.minC - weekMin) / weekSpan) * 100);
                      const widthPct = Math.max(8, Math.round(((d.maxC - d.minC) / weekSpan) * 100));
                      const label =
                        idx === 0
                          ? "Today"
                          : new Date(d.t * 1000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                      return (
                        <li key={d.t} className="grid grid-cols-[110px_auto_1fr_auto] items-center gap-3 py-2 text-[12.5px]">
                          <span suppressHydrationWarning className={idx === 0 ? "font-semibold text-foreground" : "text-foreground/85"}>
                            {label}
                          </span>
                          <div className="flex items-center gap-2">
                            <WeatherIcon condition={wmoCodeCondition(d.code)} className={`size-4 ${atmosphere.accent}`} />
                            <span className="w-8 text-[11px] text-sky-300 tabular-nums">
                              {d.pop >= 10 ? `${d.pop}%` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="w-8 text-right text-[12px] text-muted-foreground tabular-nums">
                              {formatTemp(d.minC, unit)}°
                            </span>
                            <div className="relative h-1.5 flex-1 rounded-full bg-muted/70">
                              <div
                                className="absolute inset-y-0 rounded-full bg-gradient-to-r from-sky-400/75 via-[color:var(--land-gold)] to-amber-400"
                                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                              />
                            </div>
                            <span className="w-8 text-[12px] font-medium text-foreground tabular-nums">
                              {formatTemp(d.maxC, unit)}°
                            </span>
                          </div>
                          <span className="hidden text-[11px] text-muted-foreground tabular-nums sm:inline">
                            UV {d.uv} · {d.wind} km/h
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : null}
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Tasks (1×1) — Quick add + real check/uncheck synced to Google Tasks         */
/* -------------------------------------------------------------------------- */

export function TasksWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const [view, setView] = useState<"open" | "done">("open");
  const [newTitle, setNewTitle] = useState("");
  const [taskError, setTaskError] = useState<string | null>(null);

  const allTasks = useMemo(
    () =>
      command.state!.items.filter(
        (item): item is CommandItemOf<"command.task"> =>
          item.kind === "command.task" && item.data.connectorId === "google-tasks",
      ),
    [command.state],
  );

  const openTasks = useMemo(() => allTasks.filter((t) => t.data.status === "open"), [allTasks]);
  const doneTasks = useMemo(() => allTasks.filter((t) => t.data.status === "done"), [allTasks]);
  const shown = view === "open" ? openTasks : doneTasks;

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setTaskError(null);
    const err = await command.createTask({ title });
    if (err) {
      setTaskError(err);
      return;
    }
    setNewTitle("");
    setView("open");
  }

  async function toggleTask(task: CommandItemOf<"command.task">) {
    setTaskError(null);
    const err = await command.toggleTask({
      id: task.id,
      done: task.data.status === "open",
    });
    if (err) setTaskError(err);
  }

  const actions = (
    <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5 text-[10.5px]">
      <button
        type="button"
        onClick={() => setView("open")}
        className={`rounded px-1.5 py-0.5 font-medium transition-colors tabular-nums ${
          view === "open" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Open {openTasks.length}
      </button>
      <button
        type="button"
        onClick={() => setView("done")}
        className={`rounded px-1.5 py-0.5 font-medium transition-colors tabular-nums ${
          view === "done" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Done {doneTasks.length}
      </button>
    </div>
  );

  return (
    <WidgetFrame
      title="Tasks"
      icon={<ListTodo className="size-3.5" />}
      actions={actions}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="google-tasks" command={command} onConnections={onConnections}>
        <div className="flex h-full min-h-0 flex-col gap-2">
          <form onSubmit={(e) => void addTask(e)} className="flex items-center gap-1.5">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Add a task…"
              aria-label="New task title"
              className="h-7 flex-1 rounded-lg border-border/70 bg-background/40 text-[12px]"
            />
            <Button
              type="submit"
              size="icon-xs"
              variant="secondary"
              aria-label="Add task"
              disabled={command.pending === "task:create" || !newTitle.trim()}
              className="size-7 rounded-lg"
            >
              <Plus className="size-3.5" />
            </Button>
          </form>

          {taskError ? (
            <Alert variant="destructive" className="rounded-lg py-1.5">
              <AlertDescription className="text-[11px]">{taskError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
            {shown.length === 0 ? (
              <p className="cmd-empty py-4 text-center">
                {view === "open" ? "No open tasks — enjoy the clear list." : "Nothing completed today yet."}
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {shown.map((task) => {
                  const isDone = task.data.status === "done";
                  const busy = command.pending === `task:${task.id}`;
                  return (
                    <li key={task.id} className="flex items-center gap-2 py-1.5 text-[12.5px]">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleTask(task)}
                        aria-label={isDone ? `Mark "${task.title}" open` : `Complete "${task.title}"`}
                        className="shrink-0 text-muted-foreground transition-colors hover:text-[color:var(--land-gold)] disabled:opacity-50"
                      >
                        {isDone ? (
                          <CheckCircle2 className="size-4 text-[color:var(--land-gold)]" />
                        ) : (
                          <Circle className="size-4" />
                        )}
                      </button>
                      <span
                        className={`min-w-0 flex-1 truncate ${
                          isDone ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {task.title}
                      </span>
                      {task.data.priority === "high" && !isDone ? (
                        <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--land-gold)]" title="Due today" />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Crypto (2×1) — Multi-asset grid + inline coin customizer                   */
/* -------------------------------------------------------------------------- */

export function CryptoWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const conn = command.state!.connections.find((c) => c.connectorId === "markets");
  const coins = command.state!.items.filter(
    (item): item is CommandItemOf<"command.signal"> =>
      item.kind === "command.signal" && item.data.metric.startsWith("market.crypto."),
  );
  const [editOpen, setEditOpen] = useState(false);
  const [coinList, setCoinList] = useState(() => conn?.settings["crypto"] ?? "bitcoin, ethereum, solana");
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function saveCoins(e: FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    const err = await command.connect("markets", { settings: { crypto: coinList } });
    if (err) {
      setSaveErr(err);
      return;
    }
    setEditOpen(false);
  }

  const actions = conn ? (
    <Popover
      open={editOpen}
      onOpenChange={(next) => {
        if (next) setCoinList(conn.settings["crypto"] ?? coins.map((c) => c.data.metric.replace("market.crypto.", "")).join(", "));
        setEditOpen(next);
      }}
    >
      <PopoverTooltipIcon
        open={editOpen}
        label="Edit tracked coins"
        icon={<SlidersHorizontal className="size-3.5" />}
      />
      <PopoverContent align="end" sideOffset={6} className="w-72 rounded-xl border border-border bg-popover p-3.5 shadow-xl">
        <form onSubmit={(e) => void saveCoins(e)} className="space-y-2.5">
          <p className="text-[12.5px] font-medium">Tracked CoinGecko IDs</p>
          <Input
            value={coinList}
            onChange={(e) => setCoinList(e.target.value)}
            placeholder="bitcoin, ethereum, solana"
            aria-label="CoinGecko coin ids"
            className="h-8 rounded-lg text-[12px]"
          />
          {saveErr ? <p className="text-[11px] text-destructive">{saveErr}</p> : null}
          <Button type="submit" size="sm" className="w-full" disabled={command.pending === "connect:markets"}>
            {command.pending === "connect:markets" ? "Updating…" : "Save coins"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  ) : undefined;

  return (
    <WidgetFrame
      title="Crypto"
      icon={<Coins className="size-3.5" />}
      hint="24h"
      actions={actions}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="markets" command={command} onConnections={onConnections}>
        {coins.length === 0 ? (
          <p className="cmd-empty py-5 text-center">No prices yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 pt-0.5 sm:grid-cols-2">
            {coins.map((coin) => {
              const down = coin.data.change !== null && coin.data.change < 0;
              const delta = typeof coin.data.details["changeLabel"] === "string" ? coin.data.details["changeLabel"] : "";
              const slug = coin.data.metric.replace("market.crypto.", "").slice(0, 4).toUpperCase();
              return (
                <div
                  key={coin.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-foreground">{coin.title}</span>
                      {coin.data.url ? (
                        <a
                          href={coin.data.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${coin.title} on CoinGecko`}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ArrowUpRight className="size-3" />
                        </a>
                      ) : null}
                    </div>
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground">{slug}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-medium tracking-tight text-foreground tabular-nums">
                      {coin.data.display}
                    </p>
                    {delta ? (
                      <span
                        className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${
                          down ? "cmd-down" : "cmd-up"
                        }`}
                      >
                        {down ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
                        {delta}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Night Sky (1×1) — True moon SVG phase + astronomical dark schedule          */
/* -------------------------------------------------------------------------- */

function MoonDisc({ illumination, phase }: { illumination: number; phase: string }) {
  const lit = Math.max(0, Math.min(100, illumination));
  const waning = phase.toLowerCase().includes("waning") || phase.toLowerCase().includes("last");
  // Approximate terminator shadow offset across disc
  const fraction = lit / 100;
  const rx = Math.abs(1 - fraction * 2) * 14;
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden className="shrink-0">
      <circle cx="18" cy="18" r="14" className="fill-muted stroke-border" strokeWidth="1" />
      {lit > 2 ? (
        <path
          d={
            lit >= 98
              ? "M 18 4 A 14 14 0 1 1 17.99 4 Z"
              : waning
                ? `M 18 4 A 14 14 0 0 0 18 32 A ${Math.max(0.5, rx)} 14 0 0 ${fraction > 0.5 ? 0 : 1} 18 4 Z`
                : `M 18 4 A 14 14 0 0 1 18 32 A ${Math.max(0.5, rx)} 14 0 0 ${fraction > 0.5 ? 1 : 0} 18 4 Z`
          }
          className="fill-[color:var(--land-gold-soft)]"
        />
      ) : null}
    </svg>
  );
}

export function SkyWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const sky = command.state!.items.find(
    (item): item is CommandItemOf<"command.signal"> =>
      item.kind === "command.signal" && item.data.metric === "sky.tonight",
  );
  const details = sky?.data.details;
  const score = sky?.data.value ?? 0;
  const phase = String(details?.["moonPhase"] ?? sky?.data.display ?? "Moon");
  const illumination = Number(details?.["moonIllumination"] ?? 0);

  return (
    <WidgetFrame
      title="Night sky"
      icon={<Moon className="size-3.5" />}
      hint={sky ? `${score}/100` : undefined}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="sky" command={command} onConnections={onConnections}>
        {!sky ? (
          <p className="cmd-empty py-5 text-center">No sky reading yet.</p>
        ) : (
          <div className="flex h-full flex-col justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-3">
              <MoonDisc illumination={illumination} phase={phase} />
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-foreground">{phase}</p>
                <p className="text-[11.5px] text-muted-foreground tabular-nums">
                  {illumination}% lit · Score {score}/100
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted/40 p-2 text-[11px]">
              <div>
                <span className="block text-[10px] text-muted-foreground">Sunset</span>
                <span className="font-medium tabular-nums">
                  {clock(typeof details?.["sunset"] === "string" ? details["sunset"] : null)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Astro dark</span>
                <span className="font-medium tabular-nums">
                  {details?.["darkStart"] ? clock(String(details["darkStart"])) : "—"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Clouds</span>
                <span className="font-medium tabular-nums">{String(details?.["cloudCover"] ?? "—")}%</span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">Best window</span>
                <span className="font-medium tabular-nums">
                  {details?.["bestHour"] ? clock(String(details["bestHour"])) : "—"}
                </span>
              </div>
            </div>
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Formula 1 (2×1 preview → Pit-Wall Motorsport Hub when expanded)            */
/* -------------------------------------------------------------------------- */

function shortSessionCode(label: string): string {
  const low = label.toLowerCase();
  if (low.includes("practice 1")) return "FP1";
  if (low.includes("practice 2")) return "FP2";
  if (low.includes("practice 3")) return "FP3";
  if (low.includes("sprint quali") || low.includes("shootout")) return "SQ";
  if (low === "sprint") return "SPR";
  if (low.includes("qualifying")) return "QUALI";
  if (low === "race") return "RACE";
  return label.slice(0, 5).toUpperCase();
}

function splitCountdownParts(targetIso: string, nowMs: number) {
  const diff = Math.max(0, Date.parse(targetIso) - nowMs);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return { days, hours, mins, live: diff === 0 };
}

export function F1Widget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const now = useNow(30_000);
  const sessions = command.state!.items
    .filter((item): item is CommandItemOf<"command.event"> => item.kind === "command.event" && item.data.connectorId === "f1")
    .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt));

  const firstTitle = sessions[0]?.title ?? "";
  const gpName = firstTitle.includes(" · ") ? firstTitle.split(" · ")[0]! : firstTitle || "Formula 1";
  const roundMatch = /^\d+-(\d+)-/.exec(sessions[0]?.data.externalId ?? "");
  const roundLabel = roundMatch ? `Round ${roundMatch[1]}` : null;
  const place = sessions[0]?.data.location ?? null;
  const nextIdx = sessions.findIndex((s) => Date.parse(s.data.endsAt ?? s.data.startsAt) >= now);
  const nextSession = nextIdx >= 0 ? sessions[nextIdx] : null;
  const f1Glow: CSSProperties = {
    ...style,
    ...(sessions.length > 0
      ? {
          backgroundImage:
            "radial-gradient(circle at 92% 0%, rgba(225, 6, 0, 0.16), transparent 54%), linear-gradient(180deg, rgba(225, 6, 0, 0.045), transparent 36%)",
        }
      : {}),
  };

  return (
    <WidgetFrame
      title={sessions.length > 0 ? gpName : "Formula 1"}
      icon={<Flag className="size-3.5 text-[#ff3b30]" />}
      hint={roundLabel && place ? `${roundLabel} · ${place}` : place ?? undefined}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={f1Glow}
    >
      <Gate connectorId="f1" command={command} onConnections={onConnections}>
        {sessions.length === 0 ? (
          <p className="cmd-empty py-5 text-center">No upcoming sessions.</p>
        ) : !expanded ? (
          <div className="flex h-full min-h-0 flex-col justify-between gap-2 pt-0.5">
            {nextSession ? (() => {
              const sessionName = nextSession.title.includes(" · ")
                ? nextSession.title.split(" · ")[1]!
                : nextSession.title;
              const startMs = Date.parse(nextSession.data.startsAt);
              const isLive = now >= startMs;
              const cd = splitCountdownParts(nextSession.data.startsAt, now);
              return (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e10600]/35 bg-[#e10600]/10 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded bg-[#e10600] px-1.5 py-0.5 font-mono text-[9.5px] font-bold tracking-wider text-white uppercase">
                        {isLive ? "LIVE" : shortSessionCode(sessionName)}
                      </span>
                      <span suppressHydrationWarning className="text-[11px] font-medium text-muted-foreground tabular-nums">
                        {dayLabel(nextSession.data.startsAt)} · {clock(nextSession.data.startsAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[13.5px] font-semibold tracking-tight text-foreground">
                      {sessionName}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <span className="block font-mono text-[14px] font-semibold tracking-tight text-foreground tabular-nums">
                        {isLive ? "ON TRACK" : cd.days > 0 ? `${cd.days}d ${cd.hours}h` : `${cd.hours}h ${cd.mins}m`}
                      </span>
                      <span className="block text-[9.5px] tracking-wider text-muted-foreground uppercase">
                        {isLive ? "Now" : "Lights out"}
                      </span>
                    </div>
                    {nextSession.data.url ? (
                      <a
                        href={nextSession.data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Open Grand Prix details"
                        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/40 hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })() : null}

            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {sessions.slice(0, 5).map((session, idx) => {
                const label = session.title.includes(" · ") ? session.title.split(" · ")[1]! : session.title;
                const done = Date.parse(session.data.endsAt ?? session.data.startsAt) < now;
                const isNext = idx === nextIdx;
                return (
                  <div
                    key={session.id}
                    className={`rounded-xl border px-2 py-1.5 transition-colors ${
                      isNext
                        ? "border-[#e10600]/45 bg-[#e10600]/8"
                        : done
                          ? "border-border/35 bg-background/15 opacity-55"
                          : "border-border/55 bg-background/25"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono text-[10px] font-semibold tracking-wider ${
                          isNext ? "text-[#ff453a]" : "text-foreground/85"
                        }`}
                      >
                        {shortSessionCode(label)}
                      </span>
                      {done ? (
                        <CheckCircle2 className="size-3 text-muted-foreground" />
                      ) : isNext ? (
                        <span className="size-1.5 rounded-full bg-[#ff3b30]" />
                      ) : null}
                    </div>
                    <p suppressHydrationWarning className="mt-1 truncate text-[10.5px] text-muted-foreground tabular-nums">
                      {dayLabel(session.data.startsAt).split(",")[0]}
                    </p>
                    <p suppressHydrationWarning className="text-[11px] font-medium text-foreground tabular-nums">
                      {clock(session.data.startsAt)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            {/* Expanded Pit-Wall Header Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e10600]/35 bg-[#e10600]/8 p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e10600] px-2.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wider text-white uppercase">
                    F1 Weekend
                  </span>
                  {roundLabel ? (
                    <span className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
                      {roundLabel}
                    </span>
                  ) : null}
                </div>
                <h4 className="mt-2 text-[24px] font-semibold tracking-tight text-foreground">{gpName}</h4>
                {place ? (
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <MapPin className="size-3.5 text-[#ff453a]" />
                    <span>{place}</span>
                  </p>
                ) : null}
              </div>

              {nextSession ? (() => {
                const cd = splitCountdownParts(nextSession.data.startsAt, now);
                const nextLabel = nextSession.title.includes(" · ")
                  ? nextSession.title.split(" · ")[1]!
                  : nextSession.title;
                return (
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-border/60 bg-background/45 px-4 py-2.5 text-right">
                      <span className="block text-[10px] font-semibold tracking-wider text-[#ff453a] uppercase">
                        Next · {nextLabel}
                      </span>
                      <div className="mt-1 flex items-baseline justify-end gap-2 font-mono text-[22px] font-semibold text-foreground tabular-nums">
                        {cd.live ? (
                          <span>ON TRACK</span>
                        ) : (
                          <>
                            <span>{String(cd.days).padStart(2, "0")}d</span>
                            <span className="text-muted-foreground">:</span>
                            <span>{String(cd.hours).padStart(2, "0")}h</span>
                            <span className="text-muted-foreground">:</span>
                            <span>{String(cd.mins).padStart(2, "0")}m</span>
                          </>
                        )}
                      </div>
                    </div>
                    {nextSession.data.url ? (
                      <a
                        href={nextSession.data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/70 bg-background/40 px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <span>Circuit Info</span>
                        <ExternalLink className="size-3.5" />
                      </a>
                    ) : null}
                  </div>
                );
              })() : null}
            </div>

            {/* Weekend Session Schedule Cards */}
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {sessions.map((session, idx) => {
                const label = session.title.includes(" · ") ? session.title.split(" · ")[1]! : session.title;
                const startMs = Date.parse(session.data.startsAt);
                const endMs = session.data.endsAt ? Date.parse(session.data.endsAt) : startMs + 60 * 60_000;
                const done = endMs < now;
                const live = now >= startMs && now <= endMs;
                const isNext = idx === nextIdx;
                const mins = Math.max(15, Math.round((endMs - startMs) / 60_000));
                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      live || isNext
                        ? "border-[#e10600]/45 bg-[#e10600]/8"
                        : done
                          ? "border-border/45 bg-background/20 opacity-60"
                          : "border-border/60 bg-background/30"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase ${
                            live || isNext
                              ? "bg-[#e10600] text-white"
                              : "bg-muted text-foreground/80"
                          }`}
                        >
                          {shortSessionCode(label)}
                        </span>
                        <span className="truncate text-[14px] font-medium text-foreground">{label}</span>
                      </div>
                      <p suppressHydrationWarning className="mt-1 text-[12px] text-muted-foreground tabular-nums">
                        {dayLabel(session.data.startsAt)} · {clock(session.data.startsAt)} – {clock(new Date(endMs).toISOString())} · {mins}m
                      </p>
                    </div>
                    <Badge
                      variant={live || isNext ? "secondary" : "outline"}
                      className={`shrink-0 text-[11px] tabular-nums ${
                        live
                          ? "border-[#e10600]/60 bg-[#e10600]/20 text-[#ff453a]"
                          : isNext
                            ? "border-[#e10600]/40 bg-[#e10600]/15 text-foreground"
                            : ""
                      }`}
                    >
                      {live ? "Live now" : done ? "Completed" : relative(session.data.startsAt, now)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Uptime (2×1) — Status codes, latency bars + inline URL configuration        */
/* -------------------------------------------------------------------------- */

export function UptimeWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const conn = command.state!.connections.find((c) => c.connectorId === "uptime");
  const sites = command.state!.items.filter(
    (item): item is CommandItemOf<"command.signal"> =>
      item.kind === "command.signal" && item.data.metric.startsWith("uptime."),
  );
  const downCount = sites.filter((s) => s.data.status === "poor").length;
  const [editOpen, setEditOpen] = useState(false);
  const [urlsText, setUrlsText] = useState(() => conn?.settings["urls"] ?? "");
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function saveUrls(e: FormEvent) {
    e.preventDefault();
    setSaveErr(null);
    const err = await command.connect("uptime", { settings: { urls: urlsText } });
    if (err) {
      setSaveErr(err);
      return;
    }
    setEditOpen(false);
  }

  const actions = conn ? (
    <>
      {sites.length > 0 ? (
        <Badge
          variant="secondary"
          className={`h-5 px-1.5 text-[10.5px] font-medium ${
            downCount > 0 ? "text-destructive" : "cmd-up"
          }`}
        >
          {downCount > 0 ? `${downCount} issue${downCount === 1 ? "" : "s"}` : "Operational"}
        </Badge>
      ) : null}
      <Popover
        open={editOpen}
        onOpenChange={(next) => {
          if (next) setUrlsText(conn.settings["urls"] ?? "");
          setEditOpen(next);
        }}
      >
        <PopoverTooltipIcon
          open={editOpen}
          label="Edit monitored URLs"
          icon={<SlidersHorizontal className="size-3.5" />}
        />
        <PopoverContent align="end" sideOffset={6} className="w-72 rounded-xl border border-border bg-popover p-3.5 shadow-xl">
          <form onSubmit={(e) => void saveUrls(e)} className="space-y-2.5">
            <p className="text-[12.5px] font-medium">Watched endpoints (max 5)</p>
            <Input
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder="https://nexus.app, https://api.nexus.app"
              aria-label="Monitored site URLs"
              className="h-8 rounded-lg text-[12px]"
            />
            {saveErr ? <p className="text-[11px] text-destructive">{saveErr}</p> : null}
            <Button type="submit" size="sm" className="w-full" disabled={command.pending === "connect:uptime"}>
              {command.pending === "connect:uptime" ? "Checking…" : "Save & probe"}
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </>
  ) : undefined;

  return (
    <WidgetFrame
      title="Uptime"
      icon={<Activity className="size-3.5" />}
      actions={actions}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="uptime" command={command} onConnections={onConnections}>
        {sites.length === 0 ? (
          <p className="cmd-empty py-5 text-center">No sites are being watched.</p>
        ) : (
          <div className="space-y-2.5 pt-0.5">
            {sites.map((site) => {
              const ms = site.data.value ?? 0;
              const width = site.data.value === null ? 100 : Math.max(8, Math.min(100, (ms / 1500) * 100));
              const code = site.data.details["code"];
              const isDown = site.data.value === null || site.data.status === "poor";
              return (
                <div key={site.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[12px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className={`size-1.5 shrink-0 rounded-full ${
                          isDown ? "bg-destructive" : site.data.status === "fair" ? "bg-[color:var(--land-gold)]" : "bg-emerald-400"
                        }`}
                      />
                      {site.data.url ? (
                        <a
                          href={site.data.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate font-medium text-foreground hover:underline"
                        >
                          {site.title}
                        </a>
                      ) : (
                        <span className="truncate font-medium text-foreground">{site.title}</span>
                      )}
                      {code ? (
                        <Badge variant="outline" className="h-4 px-1.5 font-mono text-[10px]">
                          {String(code)}
                        </Badge>
                      ) : null}
                    </div>
                    <span className={`font-mono text-[11.5px] tabular-nums ${isDown ? "cmd-down" : "cmd-up"}`}>
                      {site.data.display}
                    </span>
                  </div>
                  <div className="cmd-up-meter mb-0" aria-hidden>
                    <span
                      style={{
                        width: `${width}%`,
                        backgroundColor: isDown ? "var(--destructive)" : undefined,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* GitHub (2×1) — Clickable links + category filters                           */
/* -------------------------------------------------------------------------- */

export function GitHubWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const [filter, setFilter] = useState<"all" | "reviews" | "issues" | "pushes">("all");
  const allItems = useMemo(
    () => command.state!.items.filter((item) => item.data.connectorId === "github"),
    [command.state],
  );

  const items = useMemo(
    () =>
      allItems
        .filter((item) => {
          if (filter === "reviews") return item.kind === "command.task" && item.data.priority === "high";
          if (filter === "issues") return item.kind === "command.task" && item.data.priority !== "high";
          if (filter === "pushes") return item.kind === "command.activity";
          return true;
        })
        .slice(0, 10),
    [allItems, filter],
  );

  const actions = (
    <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5 text-[10.5px]">
      {(
        [
          ["all", "All"],
          ["reviews", "Reviews"],
          ["issues", "Work"],
          ["pushes", "Pushes"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setFilter(id)}
          className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
            filter === id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <WidgetFrame
      title="GitHub"
      icon={<GitBranch className="size-3.5" />}
      actions={actions}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="github" command={command} onConnections={onConnections}>
        {items.length === 0 ? (
          <p className="cmd-empty py-5 text-center">No matching reviews, issues, or pushes.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {items.map((item) => {
              const isPush = item.kind === "command.activity";
              const isReview = item.kind === "command.task" && item.data.priority === "high";
              const icon = isPush ? (
                <GitCommitHorizontal className="size-3.5 text-muted-foreground" />
              ) : isReview ? (
                <GitPullRequest className="size-3.5 text-[color:var(--land-gold)]" />
              ) : (
                <CircleDot className="size-3.5 text-muted-foreground" />
              );
              return (
                <li key={item.id} className="flex items-start gap-2 py-1.5 text-[12.5px]">
                  <span className="mt-0.5 shrink-0">{icon}</span>
                  <div className="min-w-0 flex-1">
                    {item.data.url ? (
                      <a
                        href={item.data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium text-foreground hover:text-[color:var(--land-gold)]"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="block truncate font-medium text-foreground">{item.title}</span>
                    )}
                    {isPush && item.data.detail ? (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {item.data.detail}
                      </span>
                    ) : null}
                  </div>
                  {item.kind === "command.task" && item.data.project ? (
                    <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
                      {item.data.project}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Strava (1×1) — Rich telemetry + 7d distance summary                        */
/* -------------------------------------------------------------------------- */

export function StravaWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const activities = command.state!.items
    .filter(
      (item): item is CommandItemOf<"command.activity"> =>
        item.kind === "command.activity" && item.data.connectorId === "strava",
    )
    .sort((a, b) => Date.parse(b.data.startedAt) - Date.parse(a.data.startedAt));
  const latest = activities[0];
  const weekKm = activities.reduce((sum, a) => sum + Number(a.data.metrics["distance_km"] ?? 0), 0);
  const km = latest?.data.metrics["distance_km"];
  const pace = latest?.data.metrics["pace_min_km"];
  const elev = latest?.data.metrics["elevation_m"];
  const hr = latest?.data.metrics["avg_hr"];
  const mins = latest?.data.durationMin;

  return (
    <WidgetFrame
      title="Strava"
      icon={<Footprints className="size-3.5" />}
      hint={activities.length ? `7d · ${weekKm.toFixed(1)} km` : undefined}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="strava" command={command} onConnections={onConnections}>
        {!latest ? (
          <p className="cmd-empty py-5 text-center">No activities this week.</p>
        ) : (
          <div className="flex h-full flex-col justify-between gap-2 pt-0.5">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="cmd-run-distance tabular-nums">
                  {typeof km === "number" && km > 0 ? km.toFixed(1) : (mins ?? "—")}
                  <span className="ml-1 text-[13px] font-normal text-muted-foreground">
                    {typeof km === "number" && km > 0 ? "km" : "min"}
                  </span>
                </p>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                  {latest.data.activity}
                </Badge>
              </div>
              {latest.data.url ? (
                <a
                  href={latest.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[12.5px] font-medium text-foreground hover:text-[color:var(--land-gold)]"
                >
                  <span className="truncate">{latest.title}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              ) : (
                <p className="mt-0.5 truncate text-[12.5px] font-medium text-foreground">{latest.title}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px]">
              <div>
                <span className="block text-[10px] text-muted-foreground">Time</span>
                <span className="font-medium tabular-nums">{mins ?? "—"}m</span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">
                  {typeof pace === "number" ? "Pace" : "Elev"}
                </span>
                <span className="font-medium tabular-nums">
                  {typeof pace === "number" ? `${pace}/km` : typeof elev === "number" ? `${elev}m` : "—"}
                </span>
              </div>
              <div>
                <span className="block text-[10px] text-muted-foreground">
                  {typeof hr === "number" ? "Avg HR" : "Runs"}
                </span>
                <span className="font-medium tabular-nums">
                  {typeof hr === "number" ? `${hr} bpm` : `${activities.length}/7d`}
                </span>
              </div>
            </div>
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Vercel (1×1) — Clickable deployments, commit ref & status                   */
/* -------------------------------------------------------------------------- */

export function VercelWidget({ command, expanded = false, onExpand, onCollapse, onRemove, onConnections, style }: WidgetProps) {
  const now = useNow(60_000);
  const deploys = command.state!.items
    .filter(
      (item): item is CommandItemOf<"command.activity"> =>
        item.kind === "command.activity" && item.data.connectorId === "vercel",
    )
    .slice(0, 6);

  return (
    <WidgetFrame
      title="Vercel"
      icon={<Triangle className="size-3 fill-current" />}
      hint={deploys.length ? `${deploys.length} recent` : undefined}
      expanded={expanded}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="vercel" command={command} onConnections={onConnections}>
        {deploys.length === 0 ? (
          <p className="cmd-empty py-5 text-center">No recent deployments.</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {deploys.map((deploy) => {
              const failed = deploy.data.status === "failed";
              const active = deploy.data.status === "in_progress";
              return (
                <li key={deploy.id} className="flex items-start gap-2 py-1.5 text-[12px]">
                  <span
                    aria-label={deploy.data.status}
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      failed
                        ? "bg-destructive"
                        : active
                          ? "animate-pulse bg-[color:var(--land-gold)]"
                          : "bg-emerald-400"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    {deploy.data.url ? (
                      <a
                        href={deploy.data.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium text-foreground hover:text-[color:var(--land-gold)]"
                      >
                        {deploy.title}
                      </a>
                    ) : (
                      <span className="block truncate font-medium text-foreground">{deploy.title}</span>
                    )}
                    {deploy.data.detail ? (
                      <p className="truncate text-[10.5px] text-muted-foreground">{deploy.data.detail}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10.5px] text-muted-foreground tabular-nums">
                    {relative(deploy.data.startedAt, now)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Gate>
    </WidgetFrame>
  );
}
