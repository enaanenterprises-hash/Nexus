"use client";

import { useState } from "react";
import { ArchitectureFieldCanvas } from "./OpticalCanvases";

const COMMAND_HORIZON_NODES = [
  { label: "Calendar", xFrac: 0.16 },
  { label: "Mail", xFrac: 0.33 },
  { label: "Code", xFrac: 0.5 },
  { label: "Music", xFrac: 0.67 },
  { label: "Rules", xFrac: 0.84 },
] as const;

const NODE_HORIZON_PORTALS = [
  { monogram: "St", label: "Studio", xFrac: 0.15 },
  { monogram: "Re", label: "Research", xFrac: 0.38 },
  { monogram: "Sd", label: "Study", xFrac: 0.62 },
  { monogram: "Lg", label: "Ledger", xFrac: 0.85 },
] as const;

export function ArchitecturePrinciple() {
  const [aiEnabled, setAiEnabled] = useState(true);

  return (
    <section
      id="architecture"
      className="scroll-mt-24 border-b border-white/[0.08] bg-[#121318] px-6 py-24 sm:px-10 lg:px-14 lg:py-32"
      aria-label="Deterministic architecture principle"
    >
      <div className="mx-auto max-w-[1280px]">
        {/* Centered Monumental Header + Segmented Mode Switch */}
        <div className="mx-auto max-w-[700px] text-center">
          <h2 className="font-editorial text-[clamp(2.4rem,4.8vw,4.15rem)] font-normal leading-[1.04] tracking-[-0.036em] text-[#f5f5f7] [text-wrap:balance]">
            Intelligence optional. Foundation unbreakable.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-[#a1a1a6]">
            Pause Network AI—Command and every Node never flinch.
          </p>

          <div
            role="group"
            aria-label="Architecture mode"
            className="mt-7 inline-flex max-w-full items-center rounded-full border border-white/[0.11] bg-[#181920] p-1"
          >
            <button
              type="button"
              aria-pressed={aiEnabled}
              onClick={() => setAiEnabled(true)}
              className={`inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 sm:gap-2 sm:px-5 sm:text-[13.5px] ${
                aiEnabled ? "bg-[#f5f5f7] text-[#09090b]" : "text-[#9d9da6] hover:text-[#f5f5f7]"
              }`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0b54a]" aria-hidden="true" />
              Network AI · On
            </button>
            <button
              type="button"
              aria-pressed={!aiEnabled}
              onClick={() => setAiEnabled(false)}
              className={`inline-flex min-h-[40px] cursor-pointer items-center whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 sm:px-5 sm:text-[13.5px] ${
                !aiEnabled ? "bg-[#f5f5f7] text-[#09090b]" : "text-[#9d9da6] hover:text-[#f5f5f7]"
              }`}
            >
              Core Only · Zero AI
            </button>
          </div>
        </div>

        {/* Monumental Full-Bleed 3-Horizon Cutaway Theater */}
        <div className="relative mx-auto mt-10 h-[460px] max-w-[1200px] overflow-hidden rounded-[24px] border border-white/[0.1] bg-[#0b0c10] sm:h-[520px]">
          <div className="pointer-events-none absolute inset-0">
            <ArchitectureFieldCanvas aiEnabled={aiEnabled} />
          </div>

          {/* ─── Upper Horizon Labels: Network (24k Gold ONLY) ─── */}
          <div className="pointer-events-none absolute inset-x-0 top-[6%] flex items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex items-center gap-2.5">
              <span
                className={`text-[14px] font-medium transition-colors duration-300 sm:text-[15px] ${
                  aiEnabled ? "text-[#f5f5f7]" : "text-[#8e8e95]"
                }`}
              >
                Network
              </span>
              <span className="text-[12px] text-[#8e8e95]">Optional AI</span>
            </div>

            {aiEnabled ? (
              <span className="inline-flex items-center gap-2 text-[11.5px] font-medium text-[#ffd99a] sm:text-[12.5px]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#f0b54a]" aria-hidden="true" />
                Active on demand
              </span>
            ) : (
              <span className="text-[11.5px] font-medium text-[#8e8e95] tabular-nums sm:text-[12.5px]">
                Paused · $0 AI cost
              </span>
            )}
          </div>

          {/* ─── Middle Horizon Labels: Command (Always Platinum-Silver) ─── */}
          <div className="pointer-events-none absolute inset-x-0 top-[41%] flex items-center justify-between gap-4 px-5 sm:px-8">
            <span className="text-[14px] font-medium text-[#f5f5f7] sm:text-[15px]">Command</span>
            <span className="inline-flex items-center gap-2 text-[11.5px] font-medium text-[#d1d1d6] tabular-nums sm:text-[12.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
              Always running · $0
            </span>
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 top-[60%]"
            aria-hidden="true"
          >
            {COMMAND_HORIZON_NODES.map((item) => (
              <span
                key={item.label}
                style={{ left: `${item.xFrac * 100}%` }}
                className="absolute -translate-x-1/2 rounded-full border border-white/[0.12] bg-[#0b0c10]/85 px-2 py-0.5 text-[10.5px] font-medium text-[#d1d1d6] backdrop-blur-sm sm:px-3 sm:py-1 sm:text-[12px]"
              >
                {item.label}
              </span>
            ))}
          </div>

          {/* ─── Lower Horizon Labels: Nodes (Always Platinum-Silver) ─── */}
          <div className="pointer-events-none absolute inset-x-0 top-[71%] flex items-center justify-between gap-4 px-5 sm:px-8">
            <div className="flex items-center gap-2.5">
              <span className="text-[14px] font-medium text-[#f5f5f7] sm:text-[15px]">Nodes</span>
              <span className="font-mono text-[11px] text-[#8e8e95]">nexusBus</span>
            </div>
            <span className="inline-flex items-center gap-2 text-[11.5px] font-medium text-[#d1d1d6] tabular-nums sm:text-[12.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
              Always running · $0
            </span>
          </div>

          <div
            className="pointer-events-none absolute inset-x-0 top-[89%]"
            aria-hidden="true"
          >
            {NODE_HORIZON_PORTALS.map((portal) => (
              <span
                key={portal.label}
                style={{ left: `${portal.xFrac * 100}%` }}
                className="absolute inline-flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.14] bg-[#0b0c10]/88 px-2 py-0.5 text-[10.5px] font-medium text-[#f5f5f7] backdrop-blur-sm sm:px-3 sm:py-1 sm:text-[12px]"
              >
                <span className="hidden font-mono text-[10px] text-[#9d9da6] sm:inline">
                  {portal.monogram}
                </span>
                <span>{portal.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
