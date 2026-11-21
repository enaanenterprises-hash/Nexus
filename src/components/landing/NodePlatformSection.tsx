"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { StudioWaveCanvas } from "./OpticalCanvases";

type NodeId = "studio" | "research" | "study" | "ledger";

type NodeDef = {
  id: NodeId;
  monogram: string;
  name: string;
  statusLabel: string;
  statusTone: "live" | "muted" | "open";
  scope: string;
};

const NODE_ITEMS: readonly NodeDef[] = [
  {
    id: "studio",
    monogram: "St",
    name: "Recording Studio",
    statusLabel: "Live",
    statusTone: "live",
    scope: "content:studio.recording:read",
  },
  {
    id: "research",
    monogram: "Re",
    name: "Research Reader",
    statusLabel: "Live",
    statusTone: "live",
    scope: "content:research.source:read",
  },
  {
    id: "study",
    monogram: "Sd",
    name: "Study Space",
    statusLabel: "Next",
    statusTone: "muted",
    scope: "study.notes:write",
  },
  {
    id: "ledger",
    monogram: "Lg",
    name: "Finance Ledger",
    statusLabel: "Open API",
    statusTone: "open",
    scope: "content:command.purchase:read",
  },
] as const;

function NodeVisualCanvas({
  id,
  studioPlaying,
  onToggleStudio,
}: {
  id: NodeId;
  studioPlaying: boolean;
  onToggleStudio: () => void;
}) {
  if (id === "studio") {
    return (
      <div className="flex min-h-[380px] flex-col justify-between p-6 sm:min-h-[420px] sm:p-8">
        <div className="relative h-[240px] overflow-hidden rounded-[14px] border border-white/[0.09] bg-[#101116] sm:h-[268px]">
          <StudioWaveCanvas playing={studioPlaying} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleStudio}
              aria-label={studioPlaying ? "Pause studio preview" : "Play studio preview"}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#f5f5f7] text-[#09090b] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75"
            >
              {studioPlaying ? (
                <Pause className="size-3.5 fill-current" aria-hidden="true" />
              ) : (
                <Play className="size-3.5 fill-current" aria-hidden="true" />
              )}
            </button>
            <span className="h-2 w-2 rounded-full bg-[#f87171]" aria-hidden="true" />
            <span className="font-mono text-[13px] text-[#f5f5f7] tabular-nums">07:42.18</span>
          </div>
          <span className="rounded-full border border-white/[0.16] bg-white/[0.05] px-3.5 py-1 text-[12px] font-medium text-[#f5f5f7]">
            Route → Study
          </span>
        </div>
      </div>
    );
  }

  if (id === "research") {
    return (
      <div className="flex min-h-[380px] flex-col justify-between p-6 sm:min-h-[420px] sm:p-8">
        <div className="grid flex-1 grid-cols-1 gap-5 sm:grid-cols-[1fr_188px]">
          <div className="flex flex-col justify-between rounded-[14px] border border-white/[0.09] bg-[#101116] p-5 sm:p-6">
            <div>
              <span className="font-mono text-[11px] text-[#8e8e95]">Reader · Clean view</span>
              <p className="font-editorial mt-3 text-[26px] leading-[1.12] tracking-[-0.02em] text-[#f5f5f7]">
                Modular Event Systems
              </p>
            </div>

            <div className="mt-6 space-y-3" aria-hidden="true">
              <div className="h-2.5 w-11/12 rounded-full bg-white/18" />
              <div className="h-2.5 w-full rounded-full bg-white/14" />
              <div className="rounded-[8px] border border-white/25 bg-white/[0.11] p-2">
                <div className="h-2.5 w-4/5 rounded-full bg-[#f5f5f7]" />
              </div>
              <div className="h-2.5 w-3/4 rounded-full bg-white/14" />
              <div className="h-2.5 w-5/6 rounded-full bg-white/12" />
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-[14px] border border-white/[0.12] bg-[#181920]/90 p-4 backdrop-blur-md">
            <span className="text-[12px] font-medium text-[#f5f5f7]">Margin note</span>
            <div className="my-5 space-y-2.5" aria-hidden="true">
              <div className="h-2 w-full rounded-full bg-white/30" />
              <div className="h-2 w-4/5 rounded-full bg-white/22" />
              <div className="h-2 w-2/3 rounded-full bg-white/16" />
            </div>
            <span className="font-mono text-[11px] text-[#9d9da6] tabular-nums">
              3 citations · Verified
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (id === "study") {
    return (
      <div className="flex min-h-[380px] flex-col justify-between p-6 sm:min-h-[420px] sm:p-8">
        <div className="relative pt-4">
          {/* Layered background deck depth cards */}
          <div
            className="mx-6 h-5 rounded-t-[14px] border border-b-0 border-white/[0.06] bg-[#16171d]"
            aria-hidden="true"
          />
          <div
            className="mx-3 h-5 rounded-t-[14px] border border-b-0 border-white/[0.08] bg-[#191a22]"
            aria-hidden="true"
          />
          <div className="rounded-[14px] border border-white/[0.12] bg-[#101116] p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full border border-white/[0.14] bg-white/[0.05] px-3 py-1 font-mono text-[11.5px] text-[#d1d1d6] tabular-nums">
                Lecture 04 · 52:18
              </span>
              <span className="text-[12px] text-[#9d9da6] tabular-nums">14 / 20</span>
            </div>

            <p className="font-editorial mt-8 text-[24px] leading-[1.2] text-[#f5f5f7]">
              Capability-scoped event buses
            </p>
            <div className="mt-4 h-2 w-2/3 rounded-full bg-white/20" aria-hidden="true" />
          </div>
        </div>

        {/* Precision SVG Circular Mastery Ring (Pure Platinum-Silver) */}
        <div className="mt-6 flex items-center justify-between rounded-[12px] border border-white/[0.08] bg-[#121318] px-4 py-3">
          <div className="flex items-center gap-3.5">
            <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden="true">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth="2.5"
              />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="#f5f5f7"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="88"
                strokeDashoffset="16"
              />
            </svg>
            <div>
              <p className="text-[13px] font-medium text-[#f5f5f7]">Mastery</p>
              <p className="text-[11.5px] text-[#8e8e95]">Exam review · Nov 28</p>
            </div>
          </div>
          <span className="font-mono text-[14px] font-medium text-[#f5f5f7] tabular-nums">82%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[380px] flex-col justify-between p-6 sm:min-h-[420px] sm:p-8">
      <div className="rounded-[14px] border border-white/[0.09] bg-[#101116] p-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <span className="text-[12px] text-[#8e8e95]">November total</span>
            <p className="mt-1 text-[30px] font-light leading-none tracking-[-0.03em] text-[#f5f5f7] tabular-nums">
              $1,248.00
            </p>
          </div>
          <span className="font-mono text-[11.5px] text-[#d1d1d6] tabular-nums">USD</span>
        </div>

        {/* Smooth Cubic SVG Area & Curve Chart (Pure Platinum-Silver) */}
        <svg viewBox="0 0 420 110" className="mt-4 block h-[104px] w-full" aria-hidden="true">
          <defs>
            <linearGradient id="ledger-silver-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M 8 88 C 65 82, 95 62, 140 66 C 185 70, 220 44, 275 48 C 325 52, 360 24, 408 18 L 408 106 L 8 106 Z"
            fill="url(#ledger-silver-fill)"
          />
          <path
            d="M 8 88 C 65 82, 95 62, 140 66 C 185 70, 220 44, 275 48 C 325 52, 360 24, 408 18"
            fill="none"
            stroke="#f5f5f7"
            strokeWidth="1.6"
          />
          <circle cx="408" cy="18" r="4" fill="#ffffff" />
          <circle cx="408" cy="18" r="9" fill="#ffffff" fillOpacity="0.18" />
        </svg>
      </div>

      <div className="mt-5 divide-y divide-white/[0.07] border-t border-white/[0.07] text-[13px] tabular-nums">
        <div className="flex items-center justify-between py-2.5">
          <span className="font-medium text-[#f5f5f7]">Linear Orbit</span>
          <span className="font-mono text-[#f5f5f7]">$48.00</span>
        </div>
        <div className="flex items-center justify-between py-2.5">
          <span className="text-[#d1d1d6]">Vercel</span>
          <span className="font-mono text-[#9d9da6]">$20.00</span>
        </div>
        <div className="flex items-center justify-between pt-2.5">
          <span className="text-[#d1d1d6]">Figma</span>
          <span className="font-mono text-[#9d9da6]">$15.00</span>
        </div>
      </div>
    </div>
  );
}

export function NodePlatformSection() {
  const [selectedId, setSelectedId] = useState<NodeId>("studio");
  const [studioPlaying, setStudioPlaying] = useState(true);
  const activeNode = NODE_ITEMS.find((item) => item.id === selectedId) ?? NODE_ITEMS[0]!;

  return (
    <section
      id="platform"
      className="scroll-mt-24 border-b border-white/[0.08] bg-[#111216] px-6 py-24 sm:px-10 lg:px-14 lg:py-28"
      aria-label="Node platform and extension API"
    >
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-14">
        {/* Left: Editorial headline + 4-row Node Selector Rail (Pure Monochrome) */}
        <div className="lg:col-span-5">
          <h2 className="font-editorial text-[clamp(2.2rem,4vw,3.4rem)] font-normal leading-[1.06] tracking-[-0.032em] text-[#f5f5f7] [text-wrap:balance]">
            Full apps, snapped into one bus
          </h2>
          <p className="mt-4 max-w-[36ch] text-[16px] leading-[1.6] text-[#a1a1a6]">
            Like extensions in a code editor—each Node is a complete application built on one
            permission-scoped API.
          </p>

          <div
            role="tablist"
            aria-label="Preview Nexus Nodes"
            className="mt-8 divide-y divide-white/[0.08] border-y border-white/[0.08]"
          >
            {NODE_ITEMS.map((node) => {
              const selected = node.id === selectedId;
              return (
                <button
                  key={node.id}
                  id={`node-tab-${node.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`node-panel-${node.id}`}
                  onClick={() => setSelectedId(node.id)}
                  className={`relative flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-4 px-3 py-3 text-left transition-colors duration-150 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/75 ${
                    selected ? "bg-white/[0.03]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  {selected ? (
                    <span
                      className="pointer-events-none absolute inset-y-2 left-0 w-[2px] bg-[#f5f5f7]"
                      aria-hidden="true"
                    />
                  ) : null}

                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11.5px] font-semibold transition-colors ${
                        selected
                          ? "border-white/50 bg-[#1e2028] text-[#f5f5f7]"
                          : "border-white/[0.12] bg-[#16171d] text-[#9d9da6]"
                      }`}
                    >
                      {node.monogram}
                    </span>
                    <span
                      className={`text-[15px] font-medium transition-colors ${
                        selected ? "text-[#f5f5f7]" : "text-[#a1a1a6]"
                      }`}
                    >
                      {node.name}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                      node.statusTone === "muted" ? "text-[#8e8e95]" : "text-[#d1d1d6]"
                    }`}
                  >
                    {node.statusTone === "live" ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
                    ) : null}
                    {node.statusLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Live Visual Node Window Frame (Pure Monochrome Platinum-Silver) */}
        <div className="min-w-0 lg:col-span-7">
          <div
            key={activeNode.id}
            id={`node-panel-${activeNode.id}`}
            role="tabpanel"
            aria-labelledby={`node-tab-${activeNode.id}`}
            className="lp-stage-panel overflow-hidden rounded-[22px] border border-white/[0.09] bg-[#15161c]"
          >
            {/* Window Chrome Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#121318] px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.16] bg-[#181920] text-[10.5px] font-semibold text-[#f5f5f7]">
                  {activeNode.monogram}
                </span>
                <span className="text-[13.5px] font-medium text-[#f5f5f7]">{activeNode.name}</span>
              </div>

              <span className="rounded-full border border-white/[0.14] bg-white/[0.04] px-2.5 py-0.5 font-mono text-[11px] text-[#d1d1d6]">
                {activeNode.scope}
              </span>
            </div>

            {/* Large Visual App Canvas */}
            <NodeVisualCanvas
              id={activeNode.id}
              studioPlaying={studioPlaying}
              onToggleStudio={() => setStudioPlaying((p) => !p)}
            />

            {/* Clean Single-Line / Responsive Open API Footer (Zero horizontal scrollbar) */}
            <div className="border-t border-white/[0.08] bg-[#121318] px-5 py-3">
              <code className="block break-words font-mono text-[11.5px] leading-[1.55] text-[#9d9da6]">
                defineExtension({"{ "}id:{" "}
                <span className="text-[#f5f5f7]">&quot;dev.nexus.{activeNode.id}&quot;</span>, api:{" "}
                1, scope: <span className="text-[#d1d1d6]">&quot;{activeNode.scope}&quot;</span>
                {" }"})
              </code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
