"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { GripVertical, LayoutGrid, Plus, Sparkles } from "lucide-react";
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
  COMMAND_BOARD_PRESETS,
  matchesPreset,
  type CommandBoardPreset,
} from "@/lib/command/presets";
import {
  COMMAND_WIDGETS,
  OVERVIEW_COLUMNS,
  OVERVIEW_ROWS,
  isMandatoryWidget,
  overviewAccepts,
  placeWidgets,
  reorderOverviewWidgets,
  widgetDef,
  type PlacedWidget,
} from "@/lib/command/widgets";
import type { CommandController } from "./use-command";
import { WidgetVisualPreview } from "./WidgetVisualPreview";
import { GmailWidget } from "./widgets/GmailWidget";
import { StorageWidget } from "./widgets/StorageWidget";
import { WidgetSlotDragProvider } from "./widgets/frame";
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

type DragState = {
  id: string;
  title: string;
  blurb: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  active: boolean;
  targetId: string | "__end__" | null;
};

export function OverviewView({
  command,
  expandRequest = null,
  onApplyPreset,
  onConnections,
  onOpenCinemaWithVaultItem,
  onOpenStudioWithVaultItem,
}: {
  command: CommandController;
  expandRequest?: { widgetId: string; itemId?: string | null; serial: number } | null;
  onApplyPreset?: (preset: CommandBoardPreset) => void;
  onConnections: (connectorId?: string) => void;
  onOpenCinemaWithVaultItem?: (itemId: string) => void;
  onOpenStudioWithVaultItem?: (itemId: string) => void;
}) {
  const overviewIds = command.state?.overview;
  const ids = useMemo(() => overviewIds ?? [], [overviewIds]);
  const placed = useMemo(() => placeWidgets(ids), [ids]);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingMailId, setPendingMailId] = useState<string | null>(null);
  const [pendingStorageItemId, setPendingStorageItemId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const idsRef = useRef(ids);
  const handledExpandRef = useRef<number | null>(null);

  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  // Honor external Spotlight ⌘K jump-to-widget and Storage deep-link requests cleanly
  useEffect(() => {
    if (!expandRequest || expandRequest.serial === handledExpandRef.current) return;
    handledExpandRef.current = expandRequest.serial;
    const { widgetId, itemId } = expandRequest;
    const current = idsRef.current;
    if (!current.includes(widgetId) && overviewAccepts(current, widgetId)) {
      void command.setOverview(placeWidgets([...current, widgetId]).map((w) => w.id));
    }
    const frame = window.requestAnimationFrame(() => {
      setPendingMailId(null);
      setPendingStorageItemId(widgetId === "storage" ? (itemId ?? null) : null);
      setExpandedId(widgetId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expandRequest, command]);

  const usedCells = useMemo(() => placed.reduce((sum, w) => sum + w.w * w.h, 0), [placed]);
  const totalCells = OVERVIEW_COLUMNS * OVERVIEW_ROWS;

  const pageFull = useMemo(
    () => COMMAND_WIDGETS.every((widget) => !overviewAccepts(ids, widget.id)),
    [ids],
  );
  const openCell = useMemo(() => findFirstOpenCell(placed), [placed]);
  const expandedWidget = useMemo(() => {
    if (!expandedId) return null;
    const found = placed.find((w) => w.id === expandedId);
    if (found) return found;
    const def = widgetDef(expandedId);
    return def ? { id: def.id, w: def.w, h: def.h, x: 0, y: 0 } : null;
  }, [expandedId, placed]);

  const collapse = useCallback(() => {
    setExpandedId(null);
    setPendingMailId(null);
    setPendingStorageItemId(null);
  }, []);

  const isDraggingSession = drag !== null;

  useEffect(() => {
    if (!isDraggingSession) return;

    function resolveTarget(clientX: number, clientY: number, draggedId: string): string | "__end__" | null {
      const hit = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-cmd-drop-id]");
      const hitId = hit?.dataset.cmdDropId ?? null;
      if (!hitId || hitId === draggedId) return null;
      return reorderOverviewWidgets(idsRef.current, draggedId, hitId) ? hitId : null;
    }

    function onPointerMove(event: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const dist = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
      if (!current.active && dist < 8) return;
      if (!current.active) {
        document.body.style.userSelect = "none";
      }
      const next: DragState = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        active: true,
        targetId: resolveTarget(event.clientX, event.clientY, current.id),
      };
      dragRef.current = next;
      setDrag(next);
    }

    function finishDrag() {
      const current = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      document.body.style.userSelect = "";
      if (!current?.active) return;

      const suppressClick = (clickEvent: MouseEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      };
      window.addEventListener("click", suppressClick, { capture: true, once: true });
      window.setTimeout(() => {
        window.removeEventListener("click", suppressClick, { capture: true });
      }, 100);

      if (current.targetId) {
        const reordered = reorderOverviewWidgets(idsRef.current, current.id, current.targetId);
        if (reordered) {
          void command.setOverview(reordered);
        }
      }
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [isDraggingSession, command]);

  const startDrag = useCallback((id: string, event: ReactPointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const def = widgetDef(id);
    const initial: DragState = {
      id,
      title: def?.name ?? id,
      blurb: def?.blurb ?? "",
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      active: false,
      targetId: null,
    };
    dragRef.current = initial;
    setDrag(initial);
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

  function applyPreset(preset: CommandBoardPreset) {
    setOpen(false);
    collapse();
    if (onApplyPreset) {
      onApplyPreset(preset);
    } else {
      void command.setOverview([...preset.widgets]);
    }
  }

  function remove(id: string) {
    if (isMandatoryWidget(id)) return;
    if (expandedId === id) collapse();
    void command.setOverview(ids.filter((widget) => widget !== id));
  }

  return (
    <div className="cmd-overview-page">
      {!expandedWidget ? (
        <div className="mx-auto flex w-full max-w-[1720px] flex-wrap items-center justify-between gap-2 px-1 pt-1 pb-0.5">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Workspace presets">
            <span className="mr-1 hidden items-center gap-1 text-[11.5px] font-medium text-muted-foreground sm:inline-flex">
              <Sparkles className="size-3 text-[color:var(--land-gold)]" />
              Layouts
            </span>
            {COMMAND_BOARD_PRESETS.map((preset) => {
              const active = matchesPreset(ids, preset);
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={command.pending === "overview"}
                  onClick={() => applyPreset(preset)}
                  title={preset.tagline}
                  aria-pressed={active}
                  className={`cmd-preset-chip ${active ? "cmd-preset-chip--active" : ""}`}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11.5px] tabular-nums text-muted-foreground md:inline">
              {usedCells}/{totalCells} cells
            </span>
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={command.pending === "overview"}
              className="cmd-preset-chip"
            >
              <LayoutGrid className="size-3.5 text-[color:var(--land-gold)]" />
              <span>Widgets</span>
            </button>
          </div>
        </div>
      ) : null}

      {expandedWidget ? (
        <div className="cmd-expanded-stage">
          <WidgetSlot
            key={`expanded-${expandedWidget.id}`}
            id={expandedWidget.id}
            command={command}
            expanded
            initialMailId={expandedWidget.id === "gmail" ? pendingMailId : null}
            initialStorageItemId={expandedWidget.id === "storage" ? pendingStorageItemId : null}
            onCollapse={collapse}
            onRemove={() => remove(expandedWidget.id)}
            onConnections={onConnections}
            onOpenCinemaWithVaultItem={onOpenCinemaWithVaultItem}
            onOpenStudioWithVaultItem={onOpenStudioWithVaultItem}
          />
        </div>
      ) : (
        <div className="cmd-board" data-cmd-dragging={drag?.active ? "true" : undefined}>
          {placed.map((widget) => {
            const isDragged = Boolean(drag?.active && drag.id === widget.id);
            const isDropTarget = Boolean(drag?.active && drag.targetId === widget.id);
            return (
              <WidgetSlotDragProvider
                key={widget.id}
                value={{
                  widgetId: widget.id,
                  dragging: isDragged,
                  dropTarget: isDropTarget,
                  onDragStartPointer: (event) => startDrag(widget.id, event),
                }}
              >
                <WidgetSlot
                  id={widget.id}
                  style={{ gridColumn: `${widget.x + 1} / span ${widget.w}`, gridRow: `${widget.y + 1} / span ${widget.h}` }}
                  command={command}
                  expanded={false}
                  onExpand={() => {
                    setPendingMailId(null);
                    setPendingStorageItemId(null);
                    setExpandedId(widget.id);
                  }}
                  onExpandStorageWithItem={(itemId) => {
                    setPendingMailId(null);
                    setPendingStorageItemId(itemId);
                    setExpandedId("storage");
                  }}
                  onOpenMessageFromPreview={(msgId) => {
                    setPendingMailId(msgId);
                    setExpandedId("gmail");
                  }}
                  onRemove={() => remove(widget.id)}
                  onConnections={onConnections}
                  onOpenCinemaWithVaultItem={onOpenCinemaWithVaultItem}
                  onOpenStudioWithVaultItem={onOpenStudioWithVaultItem}
                />
              </WidgetSlotDragProvider>
            );
          })}

          {!pageFull && openCell ? (
            <button
              type="button"
              data-cmd-drop-id="__end__"
              onClick={() => setOpen(true)}
              disabled={command.pending === "overview"}
              style={{
                gridColumn: `${openCell.x + 1} / span 1`,
                gridRow: `${openCell.y + 1} / span 1`,
              }}
              className={`cmd-add-tile group ${drag?.active && drag.targetId === "__end__" ? "cmd-add-tile--drop-target" : ""}`}
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

      {drag?.active ? (
        <div
          aria-hidden
          className="cmd-drag-ghost"
          style={{
            left: drag.x - drag.offsetX,
            top: drag.y - drag.offsetY,
            width: drag.width,
            height: drag.height,
          }}
        >
          <div className="cmd-widget-bar">
            <GripVertical className="size-3.5 text-[color:var(--land-gold)]" />
            <h3>{drag.title}</h3>
            <span className="cmd-widget-hint ml-auto">
              {drag.targetId ? "Release to move here" : "Drag over a slot"}
            </span>
          </div>
          {drag.blurb ? (
            <p className="px-3 py-2 text-[12px] text-muted-foreground">{drag.blurb}</p>
          ) : null}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden rounded-3xl border border-border bg-popover p-0 text-popover-foreground shadow-2xl ring-0 sm:max-w-[940px]">
          <DialogHeader className="border-b border-border px-6 pt-5 pb-4">
            <DialogTitle className="font-editorial text-2xl font-normal tracking-tight">
              Curate your Command board
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Snap individual live widgets onto your 4×2 desk, or load a full layout in one click.
            </DialogDescription>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {COMMAND_BOARD_PRESETS.map((preset) => {
                const active = matchesPreset(ids, preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`cmd-preset-chip ${active ? "cmd-preset-chip--active" : ""}`}
                  >
                    <span>{preset.name}</span>
                    <span className="text-[10.5px] text-muted-foreground">· {preset.widgets.length}</span>
                  </button>
                );
              })}
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[70svh]">
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
                    className={`cmd-gallery-card ${widget.w === 2 ? "cmd-gallery-card--wide" : ""} ${widget.h === 2 ? "cmd-gallery-card--tall" : ""}`}
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
                          {widget.mandatory ? "Required" : alreadyAdded ? "Added" : !accepted ? "No room" : `${widget.w}×${widget.h}`}
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
  initialStorageItemId = null,
  onExpand,
  onExpandStorageWithItem,
  onCollapse,
  onOpenMessageFromPreview,
  onRemove,
  onConnections,
  onOpenCinemaWithVaultItem,
  onOpenStudioWithVaultItem,
}: {
  id: string;
  style?: CSSProperties;
  command: CommandController;
  expanded: boolean;
  initialMailId?: string | null;
  initialStorageItemId?: string | null;
  onExpand?: () => void;
  onExpandStorageWithItem?: (itemId: string) => void;
  onCollapse?: () => void;
  onOpenMessageFromPreview?: (messageId: string) => void;
  onRemove: () => void;
  onConnections: (connectorId?: string) => void;
  onOpenCinemaWithVaultItem?: (itemId: string) => void;
  onOpenStudioWithVaultItem?: (itemId: string) => void;
}) {
  const props = { command, expanded, onExpand, onCollapse, onRemove, onConnections, style };
  switch (id) {
    case "storage":
      return (
        <StorageWidget
          command={command}
          expanded={expanded}
          initialItemId={initialStorageItemId}
          onExpand={onExpand}
          onExpandWithItem={onExpandStorageWithItem}
          onCollapse={onCollapse}
          onConnections={onConnections}
          onOpenCinemaWithItem={onOpenCinemaWithVaultItem}
          onOpenStudioWithItem={onOpenStudioWithVaultItem}
          style={style}
        />
      );
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
