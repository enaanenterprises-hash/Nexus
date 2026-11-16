"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function WidgetFrame({
  title,
  icon,
  hint,
  actions,
  onRemove,
  style,
  children,
}: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  actions?: ReactNode;
  onRemove: () => void;
  style: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section className="cmd-widget group/widget" style={style}>
      <header className="cmd-widget-bar">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {icon ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
              {icon}
            </span>
          ) : null}
          <h3 className="truncate">{title}</h3>
          {hint ? <span className="cmd-widget-hint">{hint}</span> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {actions}
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
      <div className="cmd-widget-body">{children}</div>
    </section>
  );
}
