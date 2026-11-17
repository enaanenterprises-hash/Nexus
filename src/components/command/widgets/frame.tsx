"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { ArrowLeft, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const INTERACTIVE_SELECTOR = "button, a, input, select, textarea, label, [role='button'], [data-no-expand]";

export function WidgetFrame({
  title,
  icon,
  hint,
  actions,
  expanded = false,
  onExpand,
  onCollapse,
  onRemove,
  style,
  children,
}: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  actions?: ReactNode;
  expanded?: boolean;
  onExpand?: () => void;
  onCollapse?: () => void;
  onRemove: () => void;
  style?: CSSProperties;
  children: ReactNode;
}) {
  function handleCardClick(event: MouseEvent<HTMLElement>) {
    if (expanded || !onExpand) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest(INTERACTIVE_SELECTOR)) return;
    onExpand();
  }

  return (
    <section
      className={`cmd-widget group/widget ${
        expanded
          ? "cmd-widget--expanded"
          : onExpand
            ? "cmd-widget--preview cursor-pointer"
            : ""
      }`}
      data-cmd-expanded={expanded ? "true" : undefined}
      onClick={handleCardClick}
      style={style}
    >
      <header className="cmd-widget-bar">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {expanded && onCollapse ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onCollapse}
              className="mr-1 h-7 gap-1.5 rounded-lg px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              <span>Overview</span>
            </Button>
          ) : null}
          {icon ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
              {icon}
            </span>
          ) : null}
          <h3 className={`truncate ${expanded ? "text-[14.5px]" : ""}`}>{title}</h3>
          {hint ? <span className="cmd-widget-hint">{hint}</span> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
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
        </div>
      </header>
      <div className={`cmd-widget-body ${expanded ? "cmd-widget-body--expanded" : ""}`}>{children}</div>
    </section>
  );
}
