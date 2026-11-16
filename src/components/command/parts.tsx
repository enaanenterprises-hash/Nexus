"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import type { CommandKind } from "@/lib/command/kinds";
import { sourceMonogram, sourceName } from "./format";

/** Small monogram badge naming the service an item came from. */
export function SourceGlyph({ connectorId, size = "sm" }: { connectorId: string; size?: "sm" | "lg" }) {
  return (
    <span className={`cmd-glyph ${size === "lg" ? "cmd-glyph--lg" : ""}`} title={sourceName(connectorId)} aria-hidden>
      {sourceMonogram(connectorId)}
    </span>
  );
}

export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Switch
      checked={on}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
    />
  );
}

export function StatusDot({ tone }: { tone: "ok" | "warn" | "alert" | "idle" | "live" }) {
  return <span className={`cmd-dot cmd-dot--${tone}`} aria-hidden />;
}

const KIND_PATH: Record<CommandKind, string> = {
  "command.event": "M5 6.5h14v12H5zM5 10h14M9 4v4M15 4v4",
  "command.task": "M6 12.5l3.5 3.5L18 7.5",
  "command.deadline": "M12 4v4M12 12l3 2M5 12a7 7 0 1 0 14 0 7 7 0 0 0-14 0",
  "command.activity": "M4 13h4l2-6 4 12 2-6h4",
  "command.purchase": "M6 4.5h12v15l-3-2-3 2-3-2-3 2zM9 9h6M9 12.5h6",
  "command.shipment": "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  "command.message": "M4 6.5h16v11H4zM4 7l8 6 8-6",
  "command.signal": "M5 17V13M10 17V9M15 17V11M20 17V6",
};

export function KindIcon({ kind, size = 14 }: { kind: CommandKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={KIND_PATH[kind]} />
    </svg>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="cmd-section">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="dash-eyebrow">{title}</h3>
        {aside ? <div className="text-[12px] text-[color:var(--land-faint)]">{aside}</div> : null}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Current time, refreshed every `intervalMs`, so relative labels stay pure during render. */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
