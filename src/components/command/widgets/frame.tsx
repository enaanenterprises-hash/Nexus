"use client";

import { createContext, useContext, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { ArrowLeft, GripVertical, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, [role='button'], [data-no-expand]";
const NO_DRAG_SELECTOR = "input, select, textarea, label, a, [data-no-drag]";

export type WidgetSlotDragMeta = {
  widgetId: string;
  dragging: boolean;
  dropTarget: boolean;
  onDragStartPointer: (event: PointerEvent<HTMLElement>) => void;
};

const WidgetSlotDragContext = createContext<WidgetSlotDragMeta | null>(null);

export function WidgetSlotDragProvider({
  value,
  children,
}: {
  value: WidgetSlotDragMeta | null;
  children: ReactNode;
}) {
  return <WidgetSlotDragContext.Provider value={value}>{children}</WidgetSlotDragContext.Provider>;
}

export function WidgetFrame({
  widgetId,
  title,
  icon,
  hint,
  actions,
  expanded = false,
  removable = true,
  dragging = false,
  dropTarget = false,
  onDragStartPointer,
  onExpand,
  onCollapse,
  onRemove,
  style,
  children,
}: {
  widgetId?: string;
  title: string;
  icon?: ReactNode;
  hint?: string;
  actions?: ReactNode;
  expanded?: boolean;
  removable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStartPointer?: (event: PointerEvent<HTMLElement>) => void;
  onExpand?: () => void;
  onCollapse?: () => void;
  onRemove: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const dragMeta = useContext(WidgetSlotDragContext);
  const resolvedId = widgetId ?? dragMeta?.widgetId;
  const isDragging = dragging || Boolean(dragMeta?.dragging);
  const isDropTarget = dropTarget || Boolean(dragMeta?.dropTarget);
  const handleStartDrag = onDragStartPointer ?? dragMeta?.onDragStartPointer;

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (expanded || !onExpand) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;
    onExpand();
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (expanded || !handleStartDrag || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(NO_DRAG_SELECTOR)) return;
    handleStartDrag(event);
  }

  return (
    <section
      data-cmd-drop-id={!expanded ? resolvedId : undefined}
      data-cmd-expanded={expanded ? "true" : undefined}
      onClick={handleCardClick}
      onPointerDown={handlePointerDown}
      style={style}
      className={`cmd-widget group/widget ${
        expanded
          ? "cmd-widget--expanded"
          : onExpand
            ? "cmd-widget--preview cursor-pointer"
            : ""
      } ${isDragging ? "cmd-widget--dragging" : ""} ${isDropTarget ? "cmd-widget--drop-target" : ""}`}
    >
      <header className={`cmd-widget-bar ${!expanded && handleStartDrag ? "cursor-grab active:cursor-grabbing" : ""}`}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {expanded && onCollapse ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              data-no-drag="true"
              onClick={onCollapse}
              className="mr-1 h-7 gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              <span>Overview</span>
            </Button>
          ) : handleStartDrag ? (
            <span
              aria-hidden
              title="Drag to reorder"
              className="-ml-0.5 flex shrink-0 items-center text-muted-foreground/40 transition-colors group-hover/widget:text-muted-foreground/80"
            >
              <GripVertical className="size-3.5" />
            </span>
          ) : null}
          {icon ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
              {icon}
            </span>
          ) : null}
          <h3 className={`truncate ${expanded ? "text-[14.5px]" : ""}`}>{title}</h3>
          {hint ? <span className="cmd-widget-hint">{hint}</span> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1" data-no-drag="true">
          {actions}
          {!expanded && onExpand ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 rounded-md text-muted-foreground opacity-70 transition-opacity hover:text-foreground group-hover/widget:opacity-100"
                    onClick={onExpand}
                    aria-label={`Open ${title} preview window`}
                  >
                    <Maximize2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Open full window</TooltipContent>
            </Tooltip>
          ) : null}
          {expanded && onCollapse ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="size-6 rounded-md text-muted-foreground hover:text-foreground"
                    onClick={onCollapse}
                    aria-label={`Minimize ${title}`}
                  >
                    <Minimize2 className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Back to overview</TooltipContent>
            </Tooltip>
          ) : null}
          {removable ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="cmd-widget-remove size-6 rounded-md opacity-60 transition-opacity group-hover/widget:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    onClick={onRemove}
                    aria-label={`Remove ${title}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">Remove widget</TooltipContent>
            </Tooltip>
          ) : (
            <span
              className="rounded-full border border-border/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              title="Core box pinned in Command"
            >
              Core
            </span>
          )}
        </div>
      </header>
      <div className={`cmd-widget-body ${expanded ? "cmd-widget-body--expanded" : ""}`}>{children}</div>
    </section>
  );
}
