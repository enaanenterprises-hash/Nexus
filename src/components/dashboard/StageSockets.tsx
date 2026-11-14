"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { placeholderName, type ExtensionHubSnapshot, type SlotId } from "@/lib/extensions";
import type { SocketVisual } from "./NeuralStage";
import { computeStageLayout } from "./stage-layout";

type Props = {
  hub: ExtensionHubSnapshot;
  visuals: SocketVisual[];
  selected: SlotId | null;
  onSelect: (slotId: SlotId) => void;
};

/** Accessible DOM sockets laid exactly over the canvas wiring. */
export function StageSockets({ hub, visuals, selected, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = size ? computeStageLayout(size.w, size.h, hub.slots.length) : null;

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {layout
        ? hub.slots.map((slot, i) => {
            const visual = visuals[i]!;
            const at = layout.sockets[i]!;
            const extension = slot.occupiedBy
              ? hub.extensions.find((e) => e.manifest.id === slot.occupiedBy)
              : undefined;
            const name = extension?.manifest.name ?? placeholderName(slot.placeholderKey);
            const caption =
              visual === "occupied" ? "Live" : visual === "open" ? (slot.tier === "pro" ? "Pro · open" : "Free · open") : "Pro";
            const snapped = hub.lastSnapped?.slotId === slot.id;
            return (
              <button
                key={snapped ? `${slot.id}-${hub.lastSnapped!.serial}` : slot.id}
                type="button"
                onClick={() => onSelect(slot.id)}
                title={extension?.manifest.description ?? slot.description}
                aria-label={`${slot.label}: ${extension ? `${name} is wired in` : visual === "locked" ? `locked, reserved for ${name}` : `open, reserved for ${name}`}`}
                className={`socket socket--${visual} pointer-events-auto ${snapped ? "socket-snap" : ""} ${selected === slot.id ? "socket--selected" : ""}`}
                style={{ left: at.x, top: at.y, "--socket-size": layout.compact ? "2.6rem" : "3.25rem" } as CSSProperties}
              >
                <span className="socket-ring">
                  {visual === "occupied" ? (
                    <span className="text-[12px] font-semibold tracking-[0.04em]">
                      {extension?.manifest.monogram ?? name.slice(0, 2)}
                    </span>
                  ) : visual === "open" ? (
                    <PlusGlyph />
                  ) : (
                    <LockGlyph />
                  )}
                </span>
                <span className="socket-label flex flex-col items-center leading-tight">
                  <span
                    className={`whitespace-nowrap text-[12px] font-medium sm:text-[13px] ${
                      visual === "occupied" ? "text-[color:var(--land-ink)]" : "text-[color:var(--land-muted)]"
                    }`}
                  >
                    {name}
                  </span>
                  <span
                    className={`text-[10px] font-medium tracking-[0.12em] uppercase ${
                      visual === "occupied" ? "text-[color:var(--land-gold)]" : "text-[color:var(--land-faint)]"
                    }`}
                  >
                    {caption}
                  </span>
                </span>
              </button>
            );
          })
        : null}
    </div>
  );
}

function PlusGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="13" height="15" viewBox="0 0 13 15" fill="none" aria-hidden>
      <rect x="1" y="6.5" width="11" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 6.5V4.5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
