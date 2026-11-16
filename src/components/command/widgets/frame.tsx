"use client";

import type { CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function WidgetFrame({
  title,
  hint,
  onRemove,
  style,
  children,
}: {
  title: string;
  hint?: string;
  onRemove: () => void;
  style: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section className="cmd-widget" style={style}>
      <header className="cmd-widget-bar">
        <h3>{title}</h3>
        {hint ? <span className="cmd-widget-hint">{hint}</span> : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="cmd-widget-remove size-6 rounded-md"
                onClick={onRemove}
                aria-label={`Remove ${title}`}
              >
                <X className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent side="bottom">Remove widget</TooltipContent>
        </Tooltip>
      </header>
      <div className="cmd-widget-body">{children}</div>
    </section>
  );
}
