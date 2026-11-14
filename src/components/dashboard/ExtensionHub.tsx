"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  createEmptySlots,
  getProEntitlement,
  setStubPro,
  type ExtensionSlot,
} from "@/lib/extensions";

/** Polar angles (degrees) for orbital placement around the core. */
const ANGLE_BY_INDEX = [-115, -55, 35, 125, 180];

type HubProps = {
  children?: ReactNode;
  onProChange?: (isPro: boolean) => void;
};

export function ExtensionHub({ children, onProChange }: HubProps) {
  const [slots] = useState<ExtensionSlot[]>(() => createEmptySlots());
  const [isPro, setIsPro] = useState(false);
  const entitlement = useMemo(() => {
    void isPro;
    return getProEntitlement();
  }, [isPro]);

  function togglePro() {
    const next = !isPro;
    setStubPro(next);
    setIsPro(next);
    onProChange?.(next);
  }

  return (
    <div className="relative mx-auto w-full max-w-[42rem]">
      {/* Desktop / tablet orbit */}
      <div className="relative mx-auto hidden aspect-square w-full max-w-[36rem] md:block">
        <div className="pointer-events-none absolute inset-[10%] rounded-full border border-dashed border-[color:var(--line)]" />
        <div className="pointer-events-none absolute inset-[24%] rounded-full border border-[color:var(--line)]/60" />

        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>

        {slots.map((slot, index) => {
          const angle = ANGLE_BY_INDEX[index] ?? index * 72 - 90;
          const locked = slot.tier === "pro" && !entitlement.isPro;
          return (
            <ExtensionNode
              key={slot.id}
              slot={slot}
              angle={angle}
              locked={locked}
              layout="orbit"
            />
          );
        })}
      </div>

      {/* Mobile: core then node strip */}
      <div className="md:hidden">
        <div className="mb-8 flex justify-center">{children}</div>
        <div className="flex flex-wrap items-start justify-center gap-5">
          {slots.map((slot) => {
            const locked = slot.tier === "pro" && !entitlement.isPro;
            return (
              <ExtensionNode
                key={`m-${slot.id}`}
                slot={slot}
                angle={0}
                locked={locked}
                layout="strip"
              />
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.22em] text-[color:var(--ink-faint)] uppercase">
          Hub · {FREE_ACTIVE_EXTENSION_SLOTS} free active slots
          {entitlement.isPro ? " · Pro open" : " · 3 Pro-locked"}
        </p>
        <button
          type="button"
          onClick={togglePro}
          className="border border-[color:var(--line)] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] text-[color:var(--pro)] uppercase transition-colors hover:border-[color:var(--pro)]"
        >
          {isPro ? "Stub: Pro on" : "Stub: Enable Pro"}
        </button>
      </div>
    </div>
  );
}

function ExtensionNode({
  slot,
  angle,
  locked,
  layout,
}: {
  slot: ExtensionSlot;
  angle: number;
  locked: boolean;
  layout: "orbit" | "strip";
}) {
  const radius = 44;
  const rad = (angle * Math.PI) / 180;
  const x = 50 + radius * Math.cos(rad);
  const y = 50 + radius * Math.sin(rad);
  const label =
    slot.placeholderKey === "third-party"
      ? "3rd-party"
      : titleCase(slot.placeholderKey);

  const body = (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative flex h-14 w-14 items-center justify-center rounded-full border sm:h-16 sm:w-16 ${
          locked
            ? "border-[color:var(--pro)]/50 bg-[color:var(--bg-deep)]/80"
            : "border-[color:var(--line-strong)] bg-[color:var(--bg-deep)]/80"
        }`}
      >
        <span
          className={`h-2 w-2 rounded-full ${
            locked ? "bg-[color:var(--pro)]" : "bg-[color:var(--accent-dim)]"
          }`}
        />
        {locked ? (
          <span className="absolute -right-1 -top-1 font-[family-name:var(--font-mono)] text-[8px] tracking-wider text-[color:var(--pro)] uppercase">
            Pro
          </span>
        ) : (
          <span className="absolute -right-1 -top-1 font-[family-name:var(--font-mono)] text-[8px] tracking-wider text-[color:var(--accent)] uppercase">
            Free
          </span>
        )}
      </div>
      <div className="text-center">
        <p className="font-[family-name:var(--font-display)] text-xs text-[color:var(--ink)] sm:text-sm">
          {label}
        </p>
        <p className="font-[family-name:var(--font-mono)] text-[9px] tracking-[0.14em] text-[color:var(--ink-faint)] uppercase">
          {locked ? "Locked" : "Empty"}
        </p>
      </div>
    </div>
  );

  if (layout === "strip") {
    return (
      <div className="w-[4.75rem]" title={slot.description}>
        {body}
      </div>
    );
  }

  return (
    <div
      className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
      title={slot.description}
    >
      {body}
    </div>
  );
}

function titleCase(value: string): string {
  return value.replace(/(^|-)(\w)/g, (_, _b, c: string) => c.toUpperCase());
}
