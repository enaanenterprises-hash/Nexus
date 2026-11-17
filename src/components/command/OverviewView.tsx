"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
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
import { WidgetVisualPreview } from "./WidgetVisualPreview";
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingMailId, setPendingMailId] = useState<string | null>(null);

  const pageFull = useMemo(
    () => COMMAND_WIDGETS.every((widget) => !overviewAccepts(ids, widget.id)),
    [ids],
  );
  const openCell = useMemo(() => findFirstOpenCell(placed), [placed]);
  const expandedWidget = useMemo(
    () => (expandedId ? placed.find((w) => w.id === expandedId) ?? null : null),
    [expandedId, placed],
  );

  const collapse = useCallback(() => {
    setExpandedId(null);
    setPendingMailId(null);
  }, []);

  useEffect(() => {
    if (!expandedWidget) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (
        document.querySelector(
          '[data-slot="dialog-content"][data-open], [data-slot="alert-dialog-content"][data-open], [data-slot="popover-content"][data-open]',
        )
      ) {
        return;
      }
      event.preventDefault();
      collapse();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedWidget, collapse]);

  function add(id: string) {
    if (!overviewAccepts(ids, id)) return;
    setOpen(false);
    void command.setOverview(placeWidgets([...ids, id]).map((widget) => widget.id));
  }

  function remove(id: string) {
    if (expandedId === id) collapse();
    void command.setOverview(ids.filter((widget) => widget !== id));
  }

  return (
    <div className="cmd-overview-page">
      {expandedWidget ? (
        <div className="cmd-expanded-stage">
          <WidgetSlot
            key={`expanded-${expandedWidget.id}`}
            id={expandedWidget.id}
            command={command}
            expanded
            initialMailId={expandedWidget.id === "gmail" ? pendingMailId : null}
            onCollapse={collapse}
            onRemove={() => remove(expandedWidget.id)}
            onConnections={onConnections}
          />
        </div>
      ) : (
        <div className="cmd-board">
          {placed.map((widget) => (
            <WidgetSlot
              key={widget.id}
              id={widget.id}
              style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
              command={command}
              expanded={false}
              onExpand={() => {
                setPendingMailId(null);
                setExpandedId(widget.id);
              }}
              onOpenMessageFromPreview={(msgId) => {
                setPendingMailId(msgId);
                setExpandedId("gmail");
              }}
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
      )}

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

function WidgetSlot({
  id,
  style,
  command,
  expanded,
  initialMailId = null,
  onExpand,
  onCollapse,
  onOpenMessageFromPreview,
  onRemove,
  onConnections,
}: {
  id: string;
  style?: CSSProperties;
  command: CommandController;
  expanded: boolean;
  initialMailId?: string | null;
  onExpand?: () => void;
  onCollapse?: () => void;
  onOpenMessageFromPreview?: (messageId: string) => void;
  onRemove: () => void;
  onConnections: () => void;
}) {
  const props = { command, expanded, onExpand, onCollapse, onRemove, onConnections, style };
  switch (id) {
    case "gmail":
      return (
        <GmailWidget
          command={command}
          expanded={expanded}
          initialMessageId={initialMailId}
          onOpenMessageFromPreview={onOpenMessageFromPreview}
          onExpand={onExpand}
          onCollapse={onCollapse}
          onRemove={onRemove}
          style={style}
        />
      );
    case "calendar":
      return <CalendarWidget {...props} />;
    case "weather":
      return (
        <WeatherWidget
          expanded={expanded}
          onExpand={onExpand}
          onCollapse={onCollapse}
          onRemove={onRemove}
          style={style}
        />
      );
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
