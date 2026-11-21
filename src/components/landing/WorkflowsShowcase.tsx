"use client";

import { useState } from "react";
import {
  BookOpen,
  Check,
  FolderUp,
  Mail,
  Receipt,
  SlidersHorizontal,
  Sparkles,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import { WorkflowFieldCanvas } from "./OpticalCanvases";

type WorkflowId = "creator" | "student" | "focus" | "finance";

type WorkflowMeta = {
  id: WorkflowId;
  tab: string;
  headline: string;
  usesAI: boolean;
  modeLabel: string;
  hubLabel: string;
  hubIcon: LucideIcon;
  splitRight: boolean;
  chainLabel: string;
  busEvent: string;
};

const WORKFLOW_TABS: readonly WorkflowMeta[] = [
  {
    id: "creator",
    tab: "Creator",
    headline: "“Send clips over 5 min to Drive & email Elena”",
    usesAI: true,
    modeLabel: "Network AI",
    hubLabel: "Network",
    hubIcon: Sparkles,
    splitRight: true,
    chainLabel: "Studio → Network → Drive & Gmail",
    busEvent: "studio:take-routed",
  },
  {
    id: "student",
    tab: "Student",
    headline: "Same Studio Node turns lectures into notes & dates",
    usesAI: false,
    modeLabel: "Zero AI",
    hubLabel: "Study Space",
    hubIcon: BookOpen,
    splitRight: true,
    chainLabel: "Studio → Study Space → Calendar",
    busEvent: "studio:take-routed",
  },
  {
    id: "focus",
    tab: "Focus",
    headline: "Calendar block runs Spotify & Focus Guard automatically",
    usesAI: false,
    modeLabel: "Zero AI",
    hubLabel: "Command",
    hubIcon: SlidersHorizontal,
    splitRight: false,
    chainLabel: "Calendar → Command Rules → Stack",
    busEvent: "command:automation-ran",
  },
  {
    id: "finance",
    tab: "Finance",
    headline: "Gmail receipt flows straight into your Finance Ledger",
    usesAI: false,
    modeLabel: "Zero AI",
    hubLabel: "nexusBus",
    hubIcon: Receipt,
    splitRight: false,
    chainLabel: "Gmail → nexusBus → Finance Ledger",
    busEvent: "command:item-published",
  },
] as const;

const TRACK_BARS = [
  [38, 62, 48, 82, 54, 70, 40, 58, 76, 44, 66, 52, 86, 46, 64, 38],
  [44, 74, 92, 60, 84, 52, 94, 72, 64, 88, 56, 78, 90, 62, 74, 48],
  [52, 82, 68, 90, 76, 86, 58, 92, 70, 80, 62, 88, 74, 94, 66, 54],
] as const;

const LECTURE_BARS = [
  30, 55, 78, 46, 88, 64, 42, 92, 70, 52, 84, 62, 95, 48, 74, 60, 82, 44, 68, 86, 52, 76, 38, 64,
] as const;

const SPEND_BARS = [38, 52, 44, 66, 88] as const;

const GLASS_CARD =
  "rounded-[14px] border border-white/[0.11] bg-[#14151c]/82 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]";

function LeftArtifact({ id }: { id: WorkflowId }) {
  if (id === "creator") {
    const tracks = [
      { label: "Take 01", time: "02:14", selected: false, bars: TRACK_BARS[0] },
      { label: "Take 02", time: "07:42", selected: true, bars: TRACK_BARS[1] },
      { label: "Take 03", time: "11:08", selected: true, bars: TRACK_BARS[2] },
    ];
    return (
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium text-[#f5f5f7]">Studio</span>
          <span className="text-[#8e8e95] tabular-nums">3 takes</span>
        </div>
        <div className="mt-3 space-y-2">
          {tracks.map((track) => (
            <div
              key={track.label}
              className={`flex items-center gap-3 rounded-[9px] border px-3 py-2 ${
                track.selected
                  ? "border-white/[0.16] bg-white/[0.06]"
                  : "border-white/[0.05] bg-white/[0.02] opacity-40"
              }`}
            >
              <span className="w-12 shrink-0 text-[11.5px] font-medium text-[#d1d1d6] tabular-nums">
                {track.time}
              </span>
              <div className="flex h-5 flex-1 items-center justify-between gap-[3px]" aria-hidden="true">
                {track.bars.map((h, i) => (
                  <span
                    key={i}
                    className={`w-[3px] shrink-0 rounded-full ${
                      track.selected ? "bg-[#f5f5f7]" : "bg-[#8e8e95]"
                    }`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              {track.selected ? (
                <span className="shrink-0 font-mono text-[10.5px] text-[#d1d1d6]">&gt;5m</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (id === "student") {
    return (
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium text-[#f5f5f7]">Studio · Lecture 04</span>
          <span className="font-mono text-[11.5px] text-[#d1d1d6] tabular-nums">52:18</span>
        </div>
        <div className="mt-4 rounded-[10px] border border-white/[0.08] bg-[#101116]/90 p-3.5">
          <div className="flex h-11 items-center justify-between gap-[3px]" aria-hidden="true">
            {LECTURE_BARS.map((h, i) => (
              <span
                key={i}
                className={`w-[3px] shrink-0 rounded-full ${
                  i === 4 || i === 11 || i === 16 || i === 20 ? "bg-[#f5f5f7]" : "bg-white/25"
                }`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-2.5 text-[11px] text-[#8e8e95] tabular-nums">
            <span>00:00</span>
            <span className="text-[#d1d1d6]">4 markers</span>
            <span>52:18</span>
          </div>
        </div>
      </div>
    );
  }

  if (id === "focus") {
    return (
      <div className={`${GLASS_CARD} p-4`}>
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium text-[#f5f5f7]">Google Calendar</span>
          <span className="text-[#8e8e95] tabular-nums">Thu 19</span>
        </div>
        <div className="mt-3.5 flex items-stretch gap-3 rounded-[10px] border border-white/[0.08] bg-[#101116]/90 p-3.5">
          <span className="w-[3px] shrink-0 rounded-full bg-[#f5f5f7]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-[#f5f5f7]">Deep Work</p>
            <p className="mt-1 font-mono text-[12px] text-[#9d9da6] tabular-nums">14:00 – 14:50</p>
          </div>
          <span className="inline-flex items-center gap-1.5 self-center rounded-full border border-white/[0.12] bg-white/[0.05] px-2.5 py-0.5 text-[11px] text-[#d1d1d6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
            Live
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${GLASS_CARD} p-4`}>
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-medium text-[#f5f5f7]">Gmail · Receipt</span>
        <span className="text-[#8e8e95] tabular-nums">#4082</span>
      </div>
      <div className="mt-3.5 rounded-[10px] border border-white/[0.08] bg-[#101116]/90 p-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13.5px] font-medium text-[#d1d1d6]">Linear Orbit</span>
          <span className="text-[20px] font-light tracking-[-0.02em] text-[#f5f5f7] tabular-nums">
            $48.00
          </span>
        </div>
        <div
          className="my-2.5 border-t border-dashed border-white/[0.12]"
          aria-hidden="true"
        />
        <div className="flex items-center justify-between text-[11.5px] text-[#8e8e95]">
          <span>Verified invoice</span>
          <span className="font-mono text-[#d1d1d6]">USD</span>
        </div>
      </div>
    </div>
  );
}

function RightArtifact({ id }: { id: WorkflowId }) {
  if (id === "creator") {
    return (
      <div className="space-y-3">
        <div className={`${GLASS_CARD} flex items-center justify-between gap-3 px-4 py-3.5`}>
          <div className="flex items-center gap-3">
            <FolderUp className="size-4 text-[#d1d1d6]" strokeWidth={1.6} aria-hidden="true" />
            <span className="text-[13.5px] font-medium text-[#f5f5f7]">Drive · Q4 Clips</span>
          </div>
          <span className="rounded-full border border-white/[0.1] bg-[#101116]/90 px-2.5 py-0.5 font-mono text-[11.5px] text-[#d1d1d6] tabular-nums">
            2 .wav
          </span>
        </div>

        <div className={`${GLASS_CARD} flex items-center justify-between gap-3 px-4 py-3.5`}>
          <div className="flex items-center gap-3">
            <Mail className="size-4 text-[#d1d1d6]" strokeWidth={1.6} aria-hidden="true" />
            <span className="text-[13.5px] font-medium text-[#f5f5f7]">Elena Vance</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#d1d1d6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f5f5f7]" aria-hidden="true" />
            Draft ready
          </span>
        </div>
      </div>
    );
  }

  if (id === "student") {
    const days = [24, 25, 26, 27, 28, 29, 30];
    return (
      <div className="space-y-3">
        <div className={`${GLASS_CARD} p-4`}>
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium text-[#f5f5f7]">Study Notes</span>
            <span className="text-[#9d9da6] tabular-nums">14 cards</span>
          </div>
          <div className="mt-3 space-y-2" aria-hidden="true">
            <div className="h-2 w-4/5 rounded-full bg-white/25" />
            <div className="h-2 w-full rounded-full bg-white/50" />
            <div className="h-2 w-2/3 rounded-full bg-white/18" />
          </div>
        </div>

        <div className={`${GLASS_CARD} px-4 py-3`}>
          <div className="flex items-center justify-between text-[11.5px] text-[#8e8e95]">
            <span>Calendar</span>
            <span className="text-[#d1d1d6]">Midterm · Nov 28</span>
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11.5px] tabular-nums">
            {days.map((d) => (
              <span
                key={d}
                className={`rounded-[6px] py-1 font-medium ${
                  d === 28
                    ? "bg-[#f5f5f7] text-[#09090b]"
                    : "bg-[#101116]/90 text-[#8e8e95]"
                }`}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (id === "focus") {
    return (
      <div className={`${GLASS_CARD} divide-y divide-white/[0.07] overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
              <span className="h-2 w-[2px] rounded-full bg-[#f5f5f7]" />
              <span className="h-3.5 w-[2px] rounded-full bg-[#f5f5f7]" />
              <span className="h-2.5 w-[2px] rounded-full bg-[#f5f5f7]" />
              <span className="h-3 w-[2px] rounded-full bg-[#f5f5f7]" />
            </span>
            <span className="text-[13.5px] font-medium text-[#f5f5f7]">Spotify · Focus</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#4ade80]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" aria-hidden="true" />
            Playing
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <VolumeX className="size-4 text-[#9d9da6]" strokeWidth={1.6} aria-hidden="true" />
            <span className="text-[13.5px] text-[#d1d1d6]">Alerts silenced</span>
          </div>
          <span className="font-mono text-[11.5px] text-[#8e8e95] tabular-nums">50m</span>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Check className="size-4 text-[#22c55e]" strokeWidth={1.8} aria-hidden="true" />
            <span className="text-[13.5px] text-[#d1d1d6]">Session logged</span>
          </div>
          <span className="text-[11.5px] text-[#8e8e95]">Timeline</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${GLASS_CARD} p-4`}>
      <div className="flex items-center justify-between text-[12px]">
        <span className="font-medium text-[#f5f5f7]">Finance Ledger</span>
        <div className="flex h-5 items-end gap-1" aria-hidden="true">
          {SPEND_BARS.map((h, i) => (
            <span
              key={i}
              className={`w-1.5 rounded-sm ${i === 4 ? "bg-[#f5f5f7]" : "bg-white/25"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 divide-y divide-white/[0.07] border-t border-white/[0.07] text-[12.5px] tabular-nums">
        <div className="flex items-center justify-between py-2">
          <span className="text-[#f5f5f7]">Linear Orbit</span>
          <span className="font-mono text-[#f5f5f7]">$48.00</span>
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="text-[#9d9da6]">Vercel Pro</span>
          <span className="font-mono text-[#9d9da6]">$20.00</span>
        </div>
      </div>
    </div>
  );
}

export function WorkflowsShowcase() {
  const [activeId, setActiveId] = useState<WorkflowId>("creator");
  const current = WORKFLOW_TABS.find((item) => item.id === activeId) ?? WORKFLOW_TABS[0]!;
  const HubIcon = current.hubIcon;

  return (
    <section
      id="workflows"
      className="scroll-mt-24 border-b border-white/[0.08] bg-[#111216] px-6 py-24 sm:px-10 lg:px-14 lg:py-28"
      aria-label="Workflows across Nexus"
    >
      <div className="mx-auto max-w-[1280px]">
        {/* Compact Editorial Header Row */}
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <h2 className="font-editorial text-[clamp(2.2rem,4vw,3.4rem)] font-normal leading-[1.06] tracking-[-0.032em] text-[#f5f5f7] [text-wrap:balance]">
            One flow, every craft
          </h2>

          <div
            role="tablist"
            aria-label="Workflow examples"
            className="inline-flex max-w-full flex-nowrap items-center gap-0.5 self-start rounded-full border border-white/[0.11] bg-[#181920] p-1 sm:gap-1 sm:self-auto"
          >
            {WORKFLOW_TABS.map((item) => {
              const active = item.id === activeId;
              return (
                <button
                  key={item.id}
                  id={`workflow-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`workflow-panel-${item.id}`}
                  onClick={() => setActiveId(item.id)}
                  className={`min-h-[38px] cursor-pointer whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75 sm:min-h-[40px] sm:px-4 sm:text-[13.5px] ${
                    active
                      ? "bg-[#f5f5f7] text-[#09090b]"
                      : "text-[#9d9da6] hover:text-[#f5f5f7]"
                  }`}
                >
                  {item.tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grandiose Widescreen Optical Theater Frame */}
        <div
          id={`workflow-panel-${current.id}`}
          role="tabpanel"
          aria-labelledby={`workflow-tab-${current.id}`}
          className="mt-8 flex flex-col overflow-hidden rounded-[24px] border border-white/[0.1] bg-[#0e0f13]"
        >
          {/* Minimal Top Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#13141a] px-5 py-3.5">
            <p key={current.id} className="lp-stage-panel text-[13.5px] text-[#d1d1d6]">
              {current.headline}
            </p>
            <span
              className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium ${
                current.usesAI
                  ? "border-[#f0b54a]/40 bg-[#f0b54a]/[0.08] text-[#ffd99a]"
                  : "border-white/[0.12] bg-white/[0.04] text-[#d1d1d6]"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  current.usesAI ? "bg-[#f0b54a]" : "bg-[#22c55e]"
                }`}
                aria-hidden="true"
              />
              {current.modeLabel}
            </span>
          </div>

          {/* Full-Bleed Canvas2D Optical Silk Field + Floating Diorama Plates */}
          <div className="relative flex min-h-[460px] items-center p-6 sm:min-h-[520px] sm:p-8 lg:p-12">
            <div className="pointer-events-none absolute inset-0">
              <WorkflowFieldCanvas
                mode={current.usesAI ? "ai" : "zero-ai"}
                splitRight={current.splitRight}
              />
            </div>

            <div
              key={current.id}
              className="lp-stage-panel relative z-10 grid w-full grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-12"
            >
              <LeftArtifact id={current.id} />

              {/* Center Optical Hub (24k Gold ONLY when Network AI is active; Platinum-Silver otherwise) */}
              <div className="flex flex-col items-center justify-center">
                <div
                  className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full border backdrop-blur-md ${
                    current.usesAI
                      ? "border-[#f0b54a]/80 bg-[#17140f]/88 text-[#ffd99a] shadow-[0_0_0_6px_rgba(240,181,74,0.1)]"
                      : "border-white/[0.22] bg-[#14151c]/88 text-[#f5f5f7] shadow-[0_0_0_6px_rgba(255,255,255,0.04)]"
                  }`}
                >
                  <span
                    className={`pointer-events-none absolute inset-1.5 rounded-full border ${
                      current.usesAI ? "border-[#f0b54a]/35" : "border-white/[0.12]"
                    }`}
                    aria-hidden="true"
                  />
                  <HubIcon className="relative z-10 size-5" strokeWidth={1.5} aria-hidden="true" />
                </div>
                <span className="mt-2.5 text-[12.5px] font-medium text-[#d1d1d6]">
                  {current.hubLabel}
                </span>
              </div>

              <RightArtifact id={current.id} />
            </div>
          </div>

          {/* Minimal Bottom Bus Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] bg-[#121318] px-5 py-3 text-[12px]">
            <span className="text-[#9d9da6]">{current.chainLabel}</span>
            <span className="font-mono text-[#d1d1d6]">{current.busEvent}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
