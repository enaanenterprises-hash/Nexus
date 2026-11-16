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
  ExternalLink,
  Flag,
  Footprints,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  ListTodo,
  Moon,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sun,
  Triangle,
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
  onRemove: () => void;
  onConnections: () => void;
  style: CSSProperties;
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
    const quick =
      manifest?.auth.type === "none" &&
      !(manifest.settings ?? []).some((s) => s.type === "location" || s.key === "urls");
    return (
      <div className="cmd-widget-empty">
        <p>{manifest?.name ?? "This service"} is not connected yet.</p>
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
/* Calendar (2×1) — Live status, filter & inline Google Calendar creation      */
/* -------------------------------------------------------------------------- */

function toLocalDateTimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CalendarWidget({ command, onRemove, onConnections, style }: WidgetProps) {
  const now = useNow(30_000);
  const [scope, setScope] = useState<"today" | "upcoming">("upcoming");
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

  const events = useMemo(() => {
    const todayKey = dayLabel(new Date(now).toISOString());
    return command.state!.items
      .filter(
        (item): item is CommandItemOf<"command.event"> =>
          item.kind === "command.event" &&
          item.data.connectorId === "google-calendar" &&
          item.data.status !== "cancelled",
      )
      .filter((item) => {
        const startMs = Date.parse(item.data.startsAt);
        const endMs = item.data.endsAt ? Date.parse(item.data.endsAt) : startMs + 60 * 60_000;
        if (endMs < now) return false;
        if (scope === "today") return dayLabel(item.data.startsAt) === todayKey;
        return true;
      })
      .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt))
      .slice(0, 12);
  }, [command.state, now, scope]);

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

  const actions =
    calConn && calConn.status !== "needs_auth" ? (
      <>
        <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5 text-[10.5px]">
          <button
            type="button"
            onClick={() => setScope("today")}
            className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
              scope === "today" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setScope("upcoming")}
            className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
              scope === "upcoming" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
        </div>

        <Popover open={openCreate} onOpenChange={setOpenCreate}>
          <PopoverTooltipIcon
            open={openCreate}
            label="Schedule event"
            icon={<Plus className="size-3.5" />}
          />
          <PopoverContent align="end" sideOffset={6} className="w-72 rounded-xl border border-border bg-popover p-3.5 shadow-xl">
            <form onSubmit={(e) => void submitEvent(e)} className="space-y-2.5">
              <p className="text-[12.5px] font-medium text-foreground">New calendar event</p>
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
                {command.pending === "calendar:create" ? "Scheduling…" : "Add to Calendar"}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </>
    ) : undefined;

  return (
    <WidgetFrame
      title="Calendar"
      icon={<Calendar className="size-3.5" />}
      hint={events.length ? `${events.length} upcoming` : undefined}
      actions={actions}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="google-calendar" command={command} onConnections={onConnections}>
        {events.length === 0 ? (
          <p className="cmd-empty py-5 text-center">
            {scope === "today" ? "Clear schedule for the rest of today." : "Nothing upcoming on your calendar."}
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {events.map((event) => {
              const startMs = Date.parse(event.data.startsAt);
              const endMs = event.data.endsAt ? Date.parse(event.data.endsAt) : startMs + 60 * 60_000;
              const live = now >= startMs && now < endMs;
              return (
                <li key={event.id} className="flex items-center gap-2.5 py-1.5 text-[12.5px]">
                  <span
                    aria-hidden
                    className={`size-1.5 shrink-0 rounded-full ${
                      live ? "bg-[color:var(--land-gold)]" : "bg-border"
                    }`}
                  />
                  <span className="cmd-cal-time w-16 shrink-0 text-[11.5px] font-medium tabular-nums">
                    {event.data.allDay ? "All day" : clock(event.data.startsAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {event.data.url ? (
                        <a
                          href={event.data.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate font-medium text-foreground hover:text-[color:var(--land-gold)]"
                        >
                          {event.title}
                        </a>
                      ) : (
                        <span className="truncate font-medium text-foreground">{event.title}</span>
                      )}
                      {live ? (
                        <Badge
                          variant="secondary"
                          className="h-4 border border-[color:var(--land-gold)]/40 bg-[color:var(--land-gold)]/12 px-1.5 text-[9.5px] text-[color:var(--land-gold)]"
                        >
                          Now
                        </Badge>
                      ) : null}
                    </div>
                    {event.data.location ? (
                      <p className="truncate text-[11px] text-muted-foreground">{event.data.location}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {live ? "Live" : dayLabel(event.data.startsAt)}
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

/* -------------------------------------------------------------------------- */
/* Weather (1×1) — °C/°F toggle, WMO icon, specs & hourly strip              */
/* -------------------------------------------------------------------------- */

function WeatherIcon({ condition, className = "size-3.5" }: { condition: string; className?: string }) {
  const c = condition.toLowerCase();
  if (c.includes("thunder")) return <CloudLightning className={className} />;
  if (c.includes("snow")) return <CloudSnow className={className} />;
  if (c.includes("rain") || c.includes("shower")) return <CloudRain className={className} />;
  if (c.includes("drizzle")) return <CloudDrizzle className={className} />;
  if (c.includes("fog")) return <CloudFog className={className} />;
  if (c.includes("partly")) return <CloudSun className={className} />;
  if (c.includes("overcast") || c.includes("cloud")) return <Cloud className={className} />;
  return <Sun className={className} />;
}

export function WeatherWidget({ onRemove, style }: { onRemove: () => void; style: CSSProperties }) {
  const { unit, toggle } = useTempUnit();
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
  const hours = typeof details?.["hourly"] === "string" ? details["hourly"].split(",").slice(0, 5) : [];

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

  return (
    <WidgetFrame
      title="Weather"
      icon={<WeatherIcon condition={condition} />}
      hint={weather ? String(details?.["location"] ?? "") : undefined}
      actions={actions}
      onRemove={onRemove}
      style={style}
    >
      {weather === undefined ? <p className="cmd-empty py-5 text-center">Reading the sky…</p> : null}
      {weather === null ? <p className="cmd-empty py-5 text-center">{error ?? "Weather is unavailable."}</p> : null}
      {weather ? (
        <div className="flex h-full flex-col justify-between gap-2 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="cmd-wx-temp tabular-nums">
                {formatTemp(weather.data.value ?? 0, unit)}°
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {condition} · H {formatTemp(Number(details?.["high"] ?? 0), unit)}° L{" "}
                {formatTemp(Number(details?.["low"] ?? 0), unit)}°
              </p>
            </div>
            <span className="mt-0.5 text-[color:var(--land-gold)]">
              <WeatherIcon condition={condition} className="size-5" />
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted/45 px-2.5 py-1.5 text-[11px]">
            <div>
              <span className="block text-[10px] text-muted-foreground">Feels</span>
              <span className="font-medium tabular-nums">
                {formatTemp(Number(details?.["feelsLike"] ?? weather.data.value ?? 0), unit)}°
              </span>
            </div>
            <div>
              <span className="block text-[10px] text-muted-foreground">Wind</span>
              <span className="font-medium tabular-nums">{String(details?.["windKmh"] ?? 0)} km/h</span>
            </div>
            <div>
              <span className="block text-[10px] text-muted-foreground">Rain</span>
              <span className="font-medium tabular-nums">{String(details?.["rainChance"] ?? 0)}%</span>
            </div>
          </div>

          <ol className="cmd-wx-hours mt-0">
            {hours.map((hour, index) => {
              const [t, tempC, pop] = hour.split(":").map(Number);
              const at = new Date((t ?? 0) * 1000);
              return (
                <li key={index} className="rounded-md bg-muted/30 py-1">
                  <span className="text-[11px] font-medium tabular-nums">
                    {formatTemp(tempC ?? 0, unit)}°
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {index === 0 ? "Now" : at.toLocaleTimeString(undefined, { hour: "numeric" })}
                  </span>
                  {(pop ?? 0) >= 15 ? (
                    <span className="text-[9.5px] text-[color:var(--land-gold)] tabular-nums">{pop}%</span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Tasks (1×1) — Quick add + real check/uncheck synced to Google Tasks         */
/* -------------------------------------------------------------------------- */

export function TasksWidget({ command, onRemove, onConnections, style }: WidgetProps) {
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

export function CryptoWidget({ command, onRemove, onConnections, style }: WidgetProps) {
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

export function SkyWidget({ command, onRemove, onConnections, style }: WidgetProps) {
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
/* Formula 1 (2×1) — Next session countdown + weekend session schedule         */
/* -------------------------------------------------------------------------- */

export function F1Widget({ command, onRemove, onConnections, style }: WidgetProps) {
  const now = useNow(60_000);
  const sessions = command.state!.items
    .filter((item): item is CommandItemOf<"command.event"> => item.kind === "command.event" && item.data.connectorId === "f1")
    .sort((a, b) => Date.parse(a.data.startsAt) - Date.parse(b.data.startsAt));
  const place = sessions[0]?.data.location;
  const nextIdx = sessions.findIndex((s) => Date.parse(s.data.endsAt ?? s.data.startsAt) >= now);
  const nextSession = nextIdx >= 0 ? sessions[nextIdx] : null;

  return (
    <WidgetFrame
      title="Formula 1"
      icon={<Flag className="size-3.5" />}
      hint={place ?? undefined}
      onRemove={onRemove}
      style={style}
    >
      <Gate connectorId="f1" command={command} onConnections={onConnections}>
        {sessions.length === 0 ? (
          <p className="cmd-empty py-5 text-center">No upcoming sessions.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {nextSession ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/10 px-3 py-2">
                <div className="min-w-0">
                  <span className="text-[10.5px] font-semibold tracking-wider text-[color:var(--land-gold)] uppercase">
                    Up next · {dayLabel(nextSession.data.startsAt)} {clock(nextSession.data.startsAt)}
                  </span>
                  <p className="truncate text-[13px] font-medium text-foreground">{nextSession.title}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Badge variant="outline" className="h-5 px-2 text-[11px] tabular-nums">
                    {relative(nextSession.data.startsAt, now)}
                  </Badge>
                  {nextSession.data.url ? (
                    <a
                      href={nextSession.data.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open Grand Prix details"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}

            <ul className="divide-y divide-border/50">
              {sessions.map((session, idx) => {
                const done = Date.parse(session.data.endsAt ?? session.data.startsAt) < now;
                const isNext = idx === nextIdx;
                return (
                  <li
                    key={session.id}
                    className={`flex items-center justify-between gap-2 py-1 text-[12px] ${
                      done ? "opacity-50" : isNext ? "font-medium text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{session.title}</span>
                    <span className="shrink-0 tabular-nums">
                      {dayLabel(session.data.startsAt)} · {clock(session.data.startsAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Gate>
    </WidgetFrame>
  );
}

/* -------------------------------------------------------------------------- */
/* Uptime (2×1) — Status codes, latency bars + inline URL configuration        */
/* -------------------------------------------------------------------------- */

export function UptimeWidget({ command, onRemove, onConnections, style }: WidgetProps) {
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

export function GitHubWidget({ command, onRemove, onConnections, style }: WidgetProps) {
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

export function StravaWidget({ command, onRemove, onConnections, style }: WidgetProps) {
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

export function VercelWidget({ command, onRemove, onConnections, style }: WidgetProps) {
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
