"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  COMMAND_WIDGETS,
  OVERVIEW_COLUMNS,
  OVERVIEW_ROWS,
  overviewAccepts,
  placeWidgets,
  widgetDef,
  type PlacedWidget,
} from "@/lib/command/widgets";
import type { CommandController } from "./use-command";
import { GmailWidget } from "./widgets/GmailWidget";
import {
  CalendarWidget,
  CryptoWidget,
  F1Widget,
  GitHubWidget,
  SkyWidget,
  StravaWidget,
  TasksWidget,
  UptimeWidget,
  VercelWidget,
  WeatherWidget,
} from "./widgets/ServiceWidgets";

function findFirstOpenCell(placed: readonly PlacedWidget[]): { x: number; y: number } | null {
  const occupied = Array.from({ length: OVERVIEW_ROWS }, () => Array<boolean>(OVERVIEW_COLUMNS).fill(false));
  for (const w of placed) {
    for (let dy = 0; dy < w.h; dy++) {
      for (let dx = 0; dx < w.w; dx++) {
        if (occupied[w.y + dy]) occupied[w.y + dy]![w.x + dx] = true;
      }
    }
  }
  for (let y = 0; y < OVERVIEW_ROWS; y++) {
    for (let x = 0; x < OVERVIEW_COLUMNS; x++) {
      if (!occupied[y]![x]) return { x, y };
    }
  }
  return null;
}

export function OverviewView({ command, onConnections }: { command: CommandController; onConnections: () => void }) {
  const overviewIds = command.state?.overview;
  const ids = useMemo(() => overviewIds ?? [], [overviewIds]);
  const placed = useMemo(() => placeWidgets(ids), [ids]);
  const [open, setOpen] = useState(false);
  const pageFull = useMemo(
    () => COMMAND_WIDGETS.every((widget) => !overviewAccepts(ids, widget.id)),
    [ids],
  );
  const openCell = useMemo(() => findFirstOpenCell(placed), [placed]);

  function add(id: string) {
    if (!overviewAccepts(ids, id)) return;
    setOpen(false);
    void command.setOverview(placeWidgets([...ids, id]).map((widget) => widget.id));
  }

  function remove(id: string) {
    void command.setOverview(ids.filter((widget) => widget !== id));
  }

  return (
    <div className="cmd-overview-page">
      <div className="cmd-board">
        {placed.map((widget) => (
          <WidgetSlot
            key={widget.id}
            id={widget.id}
            style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
            command={command}
            onRemove={() => remove(widget.id)}
            onConnections={onConnections}
          />
        ))}

        {!pageFull && openCell ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={command.pending === "overview"}
            style={{
              gridColumn: `${openCell.x + 1} / span 1`,
              gridRow: `${openCell.y + 1} / span 1`,
            }}
            className="cmd-add-tile group"
            aria-label="Add widget"
          >
            <div className="cmd-add-tile-card">
              <div className="cmd-add-tile-chrome" aria-hidden>
                <span className="cmd-add-tile-dot" />
                <span className="cmd-add-tile-bar" />
              </div>
              <div className="cmd-add-tile-body">
                <span className="cmd-add-tile-plus">
                  <Plus className="size-5" />
                </span>
                <span className="cmd-add-tile-title">Add widget</span>
                <span className="cmd-add-tile-sub">Browse visual widgets</span>
              </div>
              <div className="cmd-add-tile-ghost" aria-hidden>
                <span />
                <span />
              </div>
            </div>
          </button>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden border border-border bg-popover p-0 text-popover-foreground shadow-2xl ring-0 sm:max-w-[920px]">
          <DialogHeader className="border-b border-border px-6 pt-5 pb-4">
            <DialogTitle className="font-heading text-2xl font-normal tracking-tight">
              Select a widget
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Choose a live tile to place onto your 4×2 Command overview board.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[72svh]">
            <div className="cmd-gallery-grid">
              {COMMAND_WIDGETS.map((widget) => {
                const alreadyAdded = ids.includes(widget.id);
                const accepted = overviewAccepts(ids, widget.id);
                return (
                  <button
                    key={widget.id}
                    type="button"
                    disabled={!accepted}
                    onClick={() => add(widget.id)}
                    className={`cmd-gallery-card ${widget.w === 2 ? "cmd-gallery-card--wide" : ""}`}
                    aria-label={`Add ${widget.name} widget`}
                  >
                    <div className="cmd-widget cmd-gallery-widget pointer-events-none h-full w-full text-left">
                      <header className="cmd-widget-bar">
                        <h3>{widget.name}</h3>
                        <span className="cmd-widget-hint">{widget.blurb}</span>
                        <Badge
                          variant={alreadyAdded ? "secondary" : "outline"}
                          className="ml-auto h-5 shrink-0 px-2 text-[10.5px] font-semibold tabular-nums"
                        >
                          {alreadyAdded ? "Added" : !accepted ? "No room" : `${widget.w}×${widget.h}`}
                        </Badge>
                      </header>
                      <div className="cmd-widget-body">
                        <WidgetVisualPreview id={widget.id} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Visual miniature preview of each widget rendered inside the widget select gallery. */
function WidgetVisualPreview({ id }: { id: string }) {
  switch (id) {
    case "gmail":
      return (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-[10.5px] text-muted-foreground">
            <span>All · Unread</span>
            <span className="font-medium text-[color:var(--land-gold)]">Compose</span>
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span className="flex items-center gap-1.5 truncate text-[12px] font-medium">
              <span className="size-1.5 rounded-full bg-[color:var(--land-gold)]" />
              Alex Rivera · Q4 rollout & latency
            </span>
            <span className="text-[10.5px] text-muted-foreground">10m</span>
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5 text-[12px] text-muted-foreground">
            <span className="truncate">Linear · 3 issues assigned in Nexus</span>
            <span className="text-[10.5px]">1h</span>
          </div>
        </div>
      );
    case "calendar":
      return (
        <div className="pt-0.5">
          <div className="cmd-cal-row">
            <span className="cmd-cal-time">09:30 AM</span>
            <span className="min-w-0 flex-1 truncate font-medium">Product architecture review</span>
            <span className="text-[11px] text-[color:var(--land-gold)]">Now</span>
          </div>
          <div className="cmd-cal-row">
            <span className="cmd-cal-time">11:30 AM</span>
            <span className="min-w-0 flex-1 truncate">Design system & Laniakea sync</span>
            <span className="text-[11px] text-muted-foreground">Today</span>
          </div>
          <div className="cmd-cal-row border-b-0">
            <span className="cmd-cal-time">02:00 PM</span>
            <span className="min-w-0 flex-1 truncate">Founder 1:1</span>
            <span className="text-[11px] text-muted-foreground">Today</span>
          </div>
        </div>
      );
    case "weather":
      return (
        <div className="space-y-2 pt-0.5">
          <div>
            <p className="cmd-wx-temp">72°</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">Mostly clear · H 75° L 58°</p>
          </div>
          <ol className="cmd-wx-hours mt-0">
            {[
              ["Now", "72°"],
              ["1PM", "74°"],
              ["2PM", "75°"],
              ["3PM", "73°"],
            ].map(([t, temp]) => (
              <li key={t} className="rounded bg-muted/40 py-0.5">
                <span>{temp}</span>
                <span className="text-[color:var(--land-faint)]">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      );
    case "tasks":
      return (
        <div className="space-y-1.5 pt-0.5">
          <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[11px] text-muted-foreground">
            + Add a task…
          </div>
          {[
            "Finalize Laniakea stage polish",
            "Review Google OAuth scopes",
            "Send investor update deck",
          ].map((title, idx) => (
            <div key={title} className={`cmd-task-row py-1 text-[12px] ${idx === 2 ? "border-b-0" : ""}`}>
              <span aria-hidden className="h-3 w-3 flex-none rounded-full border border-[color:var(--land-line)]" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
            </div>
          ))}
        </div>
      );
    case "crypto":
      return (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
            <span className="block text-[11.5px] font-medium">Bitcoin</span>
            <span className="text-[13px] font-medium tabular-nums">$94,280</span>
            <span className="cmd-up ml-1.5 text-[11px]">+3.8%</span>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1.5">
            <span className="block text-[11.5px] font-medium">Ethereum</span>
            <span className="text-[13px] font-medium tabular-nums">$3,140</span>
            <span className="cmd-up ml-1.5 text-[11px]">+2.1%</span>
          </div>
        </div>
      );
    case "sky":
      return (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2.5">
            <span className="cmd-moon size-7" aria-hidden />
            <div>
              <p className="text-[12.5px] font-medium">Waxing Gibbous</p>
              <p className="text-[11px] text-muted-foreground">78% lit · 82/100</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-muted/40 p-1.5 text-[10.5px]">
            <span>Sunset 7:48 PM</span>
            <span>Dark 9:12 PM</span>
          </div>
        </div>
      );
    case "f1":
      return (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between rounded-lg border border-[color:var(--land-gold)]/35 bg-[color:var(--land-gold)]/10 px-2.5 py-1 text-[11.5px]">
            <span className="font-medium">Up next · Monaco Qualifying</span>
            <span>in 2d</span>
          </div>
          <div className="cmd-f1-row border-b-0">
            <span className="truncate">Monaco GP · Race</span>
            <span className="text-[color:var(--land-muted)]">Sun 9:00 AM</span>
          </div>
        </div>
      );
    case "uptime":
      return (
        <div className="space-y-2 pt-1">
          <div>
            <div className="flex justify-between text-[11.5px]">
              <span className="truncate">nexus.app · 200</span>
              <span className="cmd-up">118 ms</span>
            </div>
            <div className="cmd-up-meter mb-0" aria-hidden>
              <span style={{ width: "24%" }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-[11.5px]">
              <span className="truncate">api.nexus.app · 200</span>
              <span className="cmd-up">84 ms</span>
            </div>
            <div className="cmd-up-meter mb-0" aria-hidden>
              <span style={{ width: "16%" }} />
            </div>
          </div>
        </div>
      );
    case "github":
      return (
        <div className="pt-0.5">
          <div className="cmd-gh-row">
            <span className="min-w-0 flex-1 truncate font-medium">Review: Laniakea supercluster stage</span>
            <span className="text-[10.5px] text-muted-foreground">Nexus #42</span>
          </div>
          <div className="cmd-gh-row border-b-0">
            <span className="min-w-0 flex-1 truncate">Pushed 3 commits to main</span>
            <span className="text-[10.5px] text-muted-foreground">today</span>
          </div>
        </div>
      );
    case "strava":
      return (
        <div className="space-y-2 pt-0.5">
          <div>
            <p className="cmd-run-distance text-[1.6rem] leading-none">8.4 <span className="text-xs font-normal text-muted-foreground">km</span></p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">Morning tempo run</p>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded bg-muted/40 px-2 py-1 text-[10.5px]">
            <span>42 min</span>
            <span>5:02 /km</span>
          </div>
        </div>
      );
    case "vercel":
      return (
        <div className="pt-0.5">
          <div className="cmd-deploy-row">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span className="min-w-0 flex-1 truncate font-medium">nexus · Production</span>
            <span className="text-[10.5px] text-muted-foreground">12m</span>
          </div>
          <div className="cmd-deploy-row border-b-0">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            <span className="min-w-0 flex-1 truncate">fix: Command widget sizing</span>
            <span className="text-[10.5px] text-muted-foreground">1h</span>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function WidgetSlot({
  id,
  style,
  command,
  onRemove,
  onConnections,
}: {
  id: string;
  style: CSSProperties;
  command: CommandController;
  onRemove: () => void;
  onConnections: () => void;
}) {
  const props = { command, onRemove, onConnections, style };
  switch (id) {
    case "gmail":
      return <GmailWidget command={command} onRemove={onRemove} style={style} />;
    case "calendar":
      return <CalendarWidget {...props} />;
    case "weather":
      return <WeatherWidget onRemove={onRemove} style={style} />;
    case "tasks":
      return <TasksWidget {...props} />;
    case "crypto":
      return <CryptoWidget {...props} />;
    case "sky":
      return <SkyWidget {...props} />;
    case "f1":
      return <F1Widget {...props} />;
    case "uptime":
      return <UptimeWidget {...props} />;
    case "github":
      return <GitHubWidget {...props} />;
    case "strava":
      return <StravaWidget {...props} />;
    case "vercel":
      return <VercelWidget {...props} />;
    default:
      return widgetDef(id) ? null : null;
  }
}
