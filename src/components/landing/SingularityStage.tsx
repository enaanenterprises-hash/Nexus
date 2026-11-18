"use client";

import { useState } from "react";
import Link from "next/link";
import { CascadeFilament } from "./FilamentVisuals";
import {
  Bookmark,
  Check,
  Cloud,
  CloudSun,
  Forward,
  Inbox,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  Pause,
  PenSquare,
  Play,
  Reply,
  Search,
  SlidersHorizontal,
} from "lucide-react";

type StageLayer = "command" | "studio" | "sockets";

type MailMessage = {
  id: string;
  sender: string;
  subject: string;
  time: string;
  unread?: boolean;
  body: string[];
};

const MAIL_MESSAGES: MailMessage[] = [
  {
    id: "elena",
    sender: "Elena Vance",
    subject: "Q4 Architecture Review",
    time: "9:42 AM",
    unread: true,
    body: [
      "Hi team, the shared workspace socket spec is ready for final review ahead of Friday's build. Let me know if the Command grid timing looks clean.",
      "Best,\nElena",
    ],
  },
  {
    id: "marcus",
    sender: "Marcus Chen",
    subject: "Studio Audio Routing",
    time: "Yesterday",
    body: [
      "Tested the multi-track capture export with cloud sync on Chrome and Safari. Both stem waveforms align to the millisecond on reload.",
      "Ready to wire the Study socket handoff next.",
    ],
  },
  {
    id: "github",
    sender: "GitHub",
    subject: "PR #48 merged to main",
    time: "Nov 16",
    body: [
      "Merged pull request #48: Expand Command calendar widget to a full 30-day interactive month view with incremental Google OAuth scopes.",
      "44 extension contract smoke checks passed.",
    ],
  },
];

const NOVEMBER_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);
const CALENDAR_EVENTS: Record<number, string> = {
  4: "10:00 Product sync",
  11: "13:30 Extension SDK review",
  18: "14:00 Deep work · Socket runtime",
  24: "11:00 Las Vegas GP recap",
};

const HOURLY_WEATHER = [
  { label: "Now", temp: "11°", icon: "cloud" as const },
  { label: "12pm", temp: "13°", icon: "partly" as const },
  { label: "2pm", temp: "14°", icon: "partly" as const },
  { label: "4pm", temp: "12°", icon: "cloud" as const },
  { label: "6pm", temp: "9°", icon: "cloud" as const },
];

const F1_TIMING = [
  { pos: "1", code: "VER", teamColor: "#3671C6", gap: "Leader", sector: "29.814", lap: "1:34.218", fastest: true },
  { pos: "2", code: "LEC", teamColor: "#E8002D", gap: "+1.412", sector: "30.041", lap: "1:34.609", fastest: false },
  { pos: "3", code: "NOR", teamColor: "#FF8000", gap: "+2.845", sector: "30.188", lap: "1:34.912", fastest: false },
  { pos: "4", code: "HAM", teamColor: "#27F4D2", gap: "+4.190", sector: "30.275", lap: "1:35.104", fastest: false },
];

const STUDIO_TRACKS = [
  {
    id: "voice",
    name: "Track 01",
    role: "Voice · 48kHz",
    peaks: [
      18, 32, 24, 54, 72, 46, 22, 60, 84, 50, 38, 66, 92, 44, 26, 70, 58, 40, 20, 48, 76, 64, 34, 82, 52, 28,
      62, 88, 42, 30, 56, 74, 48, 22, 68, 50, 36, 60, 44, 24,
    ],
  },
  {
    id: "room",
    name: "Track 02",
    role: "Room stereo",
    peaks: [
      10, 14, 18, 22, 30, 24, 16, 26, 34, 22, 18, 28, 38, 20, 14, 32, 26, 20, 12, 24, 36, 28, 16, 30, 22, 14,
      26, 34, 20, 16, 24, 30, 22, 12, 28, 20, 16, 24, 18, 12,
    ],
  },
  {
    id: "master",
    name: "Master",
    role: "Synced to cloud",
    peaks: [
      14, 26, 20, 44, 62, 38, 20, 50, 74, 42, 30, 56, 80, 36, 22, 60, 48, 34, 18, 40, 66, 54, 28, 70, 44, 24,
      52, 76, 36, 26, 48, 64, 40, 20, 58, 42, 30, 50, 36, 20,
    ],
  },
];

type SocketItem = {
  id: string;
  name: string;
  status: string | null;
  live: boolean;
  tier: "Free socket" | "Pro preview" | "Core node" | "Open SDK";
  scope: string;
  summary: string;
};

const SOCKET_RAIL: SocketItem[] = [
  {
    id: "studio",
    name: "Studio",
    status: "Live",
    live: true,
    tier: "Free socket",
    scope: "media · cloud-audio",
    summary: "Two-page Record and multi-layer Edit audio workspace synced to private cloud storage.",
  },
  {
    id: "research",
    name: "Research",
    status: "Live",
    live: true,
    tier: "Core node",
    scope: "content:research.source:read",
    summary: "Built-in Brave Search browser and clean web reader that saves highlighted sources into collections.",
  },
  {
    id: "study",
    name: "Study",
    status: "Planned",
    live: false,
    tier: "Free socket",
    scope: "content:study.deck:read",
    summary: "Planned workspace turning Research highlights and Studio recordings into active-recall decks.",
  },
  {
    id: "call",
    name: "Call",
    status: "Planned",
    live: false,
    tier: "Pro preview",
    scope: "voice · calendar",
    summary: "Planned live meeting and voice-note socket wired directly to your calendar and follow-up tasks.",
  },
  {
    id: "ledger",
    name: "Ledger",
    status: "Sample",
    live: true,
    tier: "Free socket",
    scope: "content:command.purchase:read",
    summary: "Reference extension that totals receipts parsed by Command without reading the rest of your inbox.",
  },
  {
    id: "sdk",
    name: "Open SDK",
    status: null,
    live: true,
    tier: "Open SDK",
    scope: "defineExtension · apiVersion 1",
    summary: "Public TypeScript contract for authoring private or shared nodes with explicit capability scopes.",
  },
];

const LAYER_ITEMS: Array<{ id: StageLayer; label: string; shortLabel: string }> = [
  { id: "command", label: "Command", shortLabel: "Command" },
  { id: "studio", label: "Studio & Research", shortLabel: "Studio & Web" },
  { id: "sockets", label: "Modular Sockets", shortLabel: "Sockets" },
];

export function SingularityStage() {
  const [activeLayer, setActiveLayer] = useState<StageLayer>("command");
  const [selectedDay, setSelectedDay] = useState<number>(18);
  const [selectedMailId, setSelectedMailId] = useState<string>("elena");
  const [studioMode, setStudioMode] = useState<"record" | "edit">("edit");
  const [studioPlaying, setStudioPlaying] = useState<boolean>(false);
  const [playheadPct, setPlayheadPct] = useState<number>(38);
  const [inspectedSocketId, setInspectedSocketId] = useState<string | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string>("studio");

  const activeMail = MAIL_MESSAGES.find((m) => m.id === selectedMailId) ?? MAIL_MESSAGES[0];
  const inspectedSocket = inspectedSocketId ? SOCKET_RAIL.find((s) => s.id === inspectedSocketId) ?? null : null;
  const activeSlot = SOCKET_RAIL.find((s) => s.id === activeSlotId) ?? SOCKET_RAIL[0];

  return (
    <section
      className="relative bg-black px-6 pb-14 sm:px-10 lg:px-14 lg:pb-16"
      aria-label="Workspace overview"
    >
      <div className="mx-auto max-w-[1280px]">
        {/* Mobile top optical cascade */}
        <div className="h-20 w-full lg:hidden" aria-hidden="true">
          <CascadeFilament activeLayer={activeLayer} />
        </div>

        {/* Threshold statement with desktop optical filament cascade connecting hero edge into workspace border */}
        <div className="relative pb-7 pt-3 lg:pb-8 lg:pt-12">
          <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
            <CascadeFilament activeLayer={activeLayer} />
          </div>
          <div className="relative z-10 max-w-[520px]">
            <h2 className="text-[clamp(2.1rem,3.9vw,3.4rem)] font-light leading-[1.06] tracking-[-0.035em] text-[#f5f5f7] [text-wrap:balance]">
              One room for everything you run
            </h2>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-[1.58] text-[#a1a1a6]">
              Nexus brings your daily tools, web research, recording studio, and modular workspaces onto one shared
              system.
            </p>
          </div>
        </div>

        {/* Asymmetric workstation row: minimal left layer rail + obsidian workspace stage */}
        <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-10">
          {/* Layer selector rail: 3-column segmented bar on mobile, quiet single-line ticks on desktop */}
          <nav
            aria-label="Nexus workspace layers"
            className="grid grid-cols-3 gap-1.5 rounded-[10px] border border-white/[0.09] bg-[#0f0f12] p-1 lg:grid-cols-1 lg:gap-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-9"
          >
            {LAYER_ITEMS.map((item) => {
              const isActive = activeLayer === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveLayer(item.id)}
                  aria-pressed={isActive}
                  className={`group flex cursor-pointer items-center justify-center rounded-[7px] px-2 py-2 text-center transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a] lg:justify-start lg:gap-3.5 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0.5 lg:text-left ${
                    isActive
                      ? "bg-[#1d1d23] text-[#f5f5f7]"
                      : "text-[#8e8e95] hover:text-[#d1d1d6]"
                  }`}
                >
                  <span
                    className={`hidden h-6 w-px shrink-0 transition-colors duration-200 lg:block ${
                      isActive ? "bg-[#f0b54a]" : "bg-white/[0.16] group-hover:bg-white/[0.34]"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[13px] font-medium tracking-[-0.01em] lg:text-[21px] lg:font-normal lg:tracking-[-0.02em]">
                    <span className="lg:hidden">{item.shortLabel}</span>
                    <span className="hidden lg:inline">{item.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Main obsidian workspace frame */}
          <div className="rounded-[16px] border border-white/[0.12] bg-[#0f0f12] p-3 sm:p-4">
            <div key={activeLayer} className="lp-stage-panel">
              {activeLayer === "command" && (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.52fr)]">
                  {/* Left: 30-day November Calendar */}
                  <div className="flex flex-col justify-between rounded-[10px] border border-white/[0.08] bg-[#16161a] p-4">
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[16px] font-normal tracking-[-0.015em] text-[#f5f5f7]">November</span>
                        {CALENDAR_EVENTS[selectedDay] ? (
                          <span className="truncate text-[12px] text-[#a1a1a6] tabular-nums">
                            {CALENDAR_EVENTS[selectedDay]}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid grid-cols-7 gap-y-1.5 text-center text-[11px] text-[#8e8e95]">
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>

                      <div className="mt-2 grid grid-cols-7 gap-1 text-center tabular-nums">
                        {NOVEMBER_DAYS.map((day) => {
                          const isSelected = day === selectedDay;
                          const hasEvent = Boolean(CALENDAR_EVENTS[day]);
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => setSelectedDay(day)}
                              aria-label={`November ${day}${hasEvent ? `, ${CALENDAR_EVENTS[day]}` : ""}`}
                              aria-pressed={isSelected}
                              className={`flex h-8 cursor-pointer items-center justify-center rounded-[7px] text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f0b54a] ${
                                isSelected
                                  ? "bg-[#2e2e36] font-medium text-[#f5f5f7]"
                                  : hasEvent
                                    ? "text-[#f5f5f7] hover:bg-white/[0.06]"
                                    : "text-[#b8b8c0] hover:bg-white/[0.05]"
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right column: Top split Gmail cards + Bottom Weather & Formula 1 */}
                  <div className="flex flex-col gap-3">
                    {/* Top row: Gmail inbox card (with slim left rail) + separate elevated reader card */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
                      {/* Gmail Inbox card */}
                      <div className="grid grid-cols-[44px_minmax(0,1fr)] overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#16161a]">
                        {/* Slim left Gmail compose/nav rail */}
                        <div
                          className="flex flex-col items-center gap-3 border-r border-white/[0.07] py-3.5 text-[#8e8e95]"
                          aria-hidden="true"
                        >
                          <Mail className="h-4 w-4 text-[#d1d1d6]" strokeWidth={1.5} />
                          <Inbox className="h-3.5 w-3.5 text-[#a1a1a6]" strokeWidth={1.5} />
                          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                          <PenSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </div>

                        {/* Message list */}
                        <div className="min-w-0 p-3">
                          <div className="mb-2 flex items-center justify-between px-1">
                            <span className="text-[15px] font-medium tracking-[-0.01em] text-[#f5f5f7]">Gmail</span>
                            <span className="text-[11px] text-[#8e8e95]">Inbox</span>
                          </div>

                          <div className="flex flex-col gap-1" role="listbox" aria-label="Sample inbox messages">
                            {MAIL_MESSAGES.map((msg) => {
                              const selected = msg.id === activeMail.id;
                              return (
                                <button
                                  key={msg.id}
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => setSelectedMailId(msg.id)}
                                  className={`cursor-pointer rounded-[6px] px-2 py-1.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f0b54a] ${
                                    selected ? "bg-[#24242b] text-[#f5f5f7]" : "text-[#c7c7cc] hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-[#f5f5f7]">
                                      {msg.unread ? (
                                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0b54a]" aria-hidden="true" />
                                      ) : null}
                                      <span className="truncate">{msg.sender}</span>
                                    </span>
                                    <span className="shrink-0 text-[11px] text-[#8e8e95] tabular-nums">{msg.time}</span>
                                  </div>
                                  <p className="mt-0.5 truncate text-[11.5px] text-[#a1a1a6]">{msg.subject}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Separate elevated Gmail reader card */}
                      <div className="flex flex-col rounded-[10px] border border-white/[0.08] bg-[#16161a] p-3.5">
                        <div className="flex items-center justify-between gap-2 text-[11.5px] text-[#8e8e95]">
                          <span className="truncate">
                            {activeMail.sender} · <span className="tabular-nums">{activeMail.time}</span>
                          </span>
                          <div className="flex items-center gap-2" aria-hidden="true">
                            <Reply className="h-3.5 w-3.5" strokeWidth={1.5} />
                            <Forward className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </div>
                        </div>
                        <p className="mt-2 text-[13.5px] font-medium text-[#f5f5f7]">{activeMail.subject}</p>
                        <div className="mt-2 space-y-2 text-[12.5px] leading-[1.52] text-[#b4b4bc]">
                          {activeMail.body.map((para, idx) => (
                            <p key={idx} className="whitespace-pre-line">
                              {para}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Bottom row: Weather Observatory + Formula 1 Pit Wall */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* Weather */}
                      <div className="flex flex-col justify-between rounded-[10px] border border-white/[0.08] bg-[#16161a] p-3.5">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[14px] text-[#d1d1d6]">Weather</span>
                            <div className="mt-1.5 flex items-baseline gap-2">
                              <span className="text-[36px] font-light leading-none tracking-[-0.04em] text-[#f5f5f7] tabular-nums">
                                11°
                              </span>
                              <span className="text-[13px] text-[#a1a1a6]">Toronto</span>
                            </div>
                          </div>
                          <CloudSun className="h-7 w-7 text-[#d1d1d6]" strokeWidth={1.35} aria-hidden="true" />
                        </div>

                        <div className="mt-4 grid grid-cols-5 gap-1 text-center tabular-nums">
                          {HOURLY_WEATHER.map((slot) => (
                            <div key={slot.label} className="flex flex-col items-center gap-1">
                              <span className="text-[11px] text-[#8e8e95]">{slot.label}</span>
                              {slot.icon === "partly" ? (
                                <CloudSun className="h-3.5 w-3.5 text-[#a1a1a6]" strokeWidth={1.45} aria-hidden="true" />
                              ) : (
                                <Cloud className="h-3.5 w-3.5 text-[#a1a1a6]" strokeWidth={1.45} aria-hidden="true" />
                              )}
                              <span className="text-[12px] text-[#f5f5f7]">{slot.temp}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Formula 1 */}
                      <div className="flex flex-col justify-between rounded-[10px] border border-white/[0.08] bg-[#16161a] p-3.5">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[14px] text-[#f5f5f7]">Formula 1</span>
                          <span className="text-[12px] text-[#8e8e95]">Las Vegas</span>
                        </div>

                        <div className="mt-3">
                          <div className="grid grid-cols-[14px_42px_1fr_1fr_1fr] gap-1.5 border-b border-white/[0.07] pb-1.5 text-[11px] text-[#8e8e95]">
                            <span />
                            <span>Driver</span>
                            <span className="text-right">Gap</span>
                            <span className="text-right">S2</span>
                            <span className="text-right">Lap</span>
                          </div>
                          <div className="mt-1.5 space-y-1.5 tabular-nums">
                            {F1_TIMING.map((row) => (
                              <div
                                key={row.code}
                                className="grid grid-cols-[14px_42px_1fr_1fr_1fr] items-center gap-1.5 text-[12px]"
                              >
                                <span className="text-[#8e8e95]">{row.pos}</span>
                                <span className="flex items-center gap-1.5 font-medium text-[#f5f5f7]">
                                  <span
                                    className="h-2.5 w-[2px] rounded-full"
                                    style={{ backgroundColor: row.teamColor }}
                                    aria-hidden="true"
                                  />
                                  {row.code}
                                </span>
                                <span className="text-right text-[#b4b4bc]">{row.gap}</span>
                                <span className={`text-right ${row.fastest ? "text-[#f0b54a]" : "text-[#b4b4bc]"}`}>
                                  {row.sector}
                                </span>
                                <span className="text-right text-[#d1d1d6]">{row.lap}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeLayer === "studio" && (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
                  {/* Recording Studio DAW */}
                  <div className="flex flex-col justify-between rounded-[10px] border border-white/[0.08] bg-[#16161a] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[15px] font-medium text-[#f5f5f7]">Studio</span>
                        <div
                          className="inline-flex rounded-[7px] border border-white/[0.1] bg-[#0f0f12] p-0.5 text-[12px]"
                          role="tablist"
                          aria-label="Studio workspace view"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={studioMode === "record"}
                            onClick={() => setStudioMode("record")}
                            className={`cursor-pointer rounded-[5px] px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f0b54a] ${
                              studioMode === "record"
                                ? "bg-[#24242b] text-[#f5f5f7]"
                                : "text-[#8e8e95] hover:text-[#d1d1d6]"
                            }`}
                          >
                            Record
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={studioMode === "edit"}
                            onClick={() => setStudioMode("edit")}
                            className={`cursor-pointer rounded-[5px] px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f0b54a] ${
                              studioMode === "edit"
                                ? "bg-[#24242b] text-[#f5f5f7]"
                                : "text-[#8e8e95] hover:text-[#d1d1d6]"
                            }`}
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 tabular-nums">
                        <span className="text-[13px] text-[#a1a1a6]">
                          {studioMode === "record" ? "Input ready · 48 kHz" : "00:14:22.4"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStudioPlaying((p) => !p)}
                          aria-label={studioPlaying ? "Pause preview" : "Play preview"}
                          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04] text-[#f5f5f7] transition-colors hover:border-white/[0.28] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a]"
                        >
                          {studioMode === "record" ? (
                            <Mic className="h-3.5 w-3.5 text-[#f0b54a]" strokeWidth={1.6} />
                          ) : studioPlaying ? (
                            <Pause className="h-3.5 w-3.5" strokeWidth={1.6} />
                          ) : (
                            <Play className="h-3.5 w-3.5" strokeWidth={1.6} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Multi-track waveforms with interactive scrub playhead */}
                    <div
                      className="relative mt-4 space-y-2"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.max(24, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
                        setPlayheadPct(Math.round(pct));
                      }}
                    >
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-[#f0b54a] transition-[left] duration-200"
                        style={{ left: `${playheadPct}%` }}
                        aria-hidden="true"
                      />
                      {STUDIO_TRACKS.map((track) => (
                        <div
                          key={track.id}
                          className="grid cursor-pointer grid-cols-[108px_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-white/[0.06] bg-[#111115] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-[#f5f5f7]">{track.name}</p>
                            <p className="truncate text-[11px] text-[#8e8e95]">{track.role}</p>
                          </div>
                          <svg
                            viewBox="0 0 240 44"
                            className="h-9 w-full"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            {track.peaks.map((amp, i) => {
                              const h = Math.max(3, (amp / 100) * 38);
                              const y = (44 - h) / 2;
                              const x = i * 6 + 1;
                              const barPct = 22 + (i / track.peaks.length) * 76;
                              const passed = barPct <= playheadPct;
                              return (
                                <rect
                                  key={i}
                                  x={x}
                                  y={y}
                                  width="2.2"
                                  height={h}
                                  rx="1"
                                  fill={passed ? "#e4e4e9" : "rgba(255,255,255,0.28)"}
                                />
                              );
                            })}
                          </svg>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#8e8e95]">
                      <span>Click timeline to move playhead</span>
                      <span>Synced via Supabase Storage</span>
                    </div>
                  </div>

                  {/* Research clean reader */}
                  <div className="flex flex-col justify-between rounded-[10px] border border-white/[0.08] bg-[#16161a] p-4">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-medium text-[#f5f5f7]">Research</span>
                        <Bookmark className="h-4 w-4 text-[#a1a1a6]" strokeWidth={1.5} aria-hidden="true" />
                      </div>

                      <div className="mt-3 flex items-center gap-2 rounded-[7px] border border-white/[0.08] bg-[#0f0f12] px-3 py-1.5 text-[12px] text-[#a1a1a6]">
                        <Search className="h-3.5 w-3.5 shrink-0 text-[#8e8e95]" strokeWidth={1.5} aria-hidden="true" />
                        <span className="truncate">Brave Search · Capability-gated personal systems</span>
                      </div>

                      <article className="mt-4 space-y-2.5">
                        <h3 className="text-[15px] font-medium leading-[1.3] tracking-[-0.015em] text-[#f5f5f7]">
                          Why personal software breaks into tabs
                        </h3>
                        <p className="text-[13px] leading-[1.6] text-[#b4b4bc]">
                          Every standalone web app keeps its own search bar, login, and private silo. Reading in one
                          clean view lets you{" "}
                          <mark className="rounded-[3px] bg-[#f0b54a]/22 px-1 py-0.5 text-[#f5f5f7]">
                            highlight once and pass typed sources to any permitted socket
                          </mark>{" "}
                          without trackers or manual copy-pasting.
                        </p>
                      </article>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-[12px] text-[#8e8e95]">
                      <span>SSRF-guarded reader</span>
                      <span className="text-[#c7c7cc]">Saved to Systems collection</span>
                    </div>
                  </div>
                </div>
              )}

              {activeLayer === "sockets" && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <div className="rounded-[10px] border border-white/[0.08] bg-[#16161a] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-medium text-[#f5f5f7]">Orbital extension slots</span>
                      <span className="text-[12px] text-[#a1a1a6]">2 free · 3 Pro preview</span>
                    </div>

                    <div className="mt-3 divide-y divide-white/[0.07]">
                      {SOCKET_RAIL.slice(0, 5).map((slot, idx) => {
                        const active = slot.id === activeSlot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setActiveSlotId(slot.id)}
                            aria-pressed={active}
                            className={`flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a] ${
                              active ? "text-[#f5f5f7]" : "text-[#b4b4bc] hover:text-[#f5f5f7]"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums ${
                                  active
                                    ? "border-[#f0b54a]/60 bg-[#f0b54a]/12 text-[#f0b54a]"
                                    : "border-white/[0.12] text-[#8e8e95]"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[14px] font-medium">{slot.name}</p>
                                <p className="truncate text-[12px] text-[#8e8e95]">{slot.scope}</p>
                              </div>
                            </div>
                            <span className="shrink-0 text-[12px] text-[#a1a1a6]">
                              {slot.tier} · {slot.status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between rounded-[10px] border border-white/[0.08] bg-[#16161a] p-4">
                    <div>
                      <div className="flex items-center gap-2 text-[#f5f5f7]">
                        <SlidersHorizontal className="h-4 w-4 text-[#f0b54a]" strokeWidth={1.5} aria-hidden="true" />
                        <span className="text-[15px] font-medium">{activeSlot.name} contract</span>
                      </div>
                      <p className="mt-2.5 text-[13.5px] leading-[1.6] text-[#b4b4bc]">{activeSlot.summary}</p>
                      <div className="mt-3.5 space-y-2 border-t border-white/[0.07] pt-3 text-[12px] text-[#a1a1a6]">
                        <div className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 text-[#f0b54a]" strokeWidth={1.75} aria-hidden="true" />
                          <span>Manifest validated on register (apiVersion 1)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Lock className="h-3.5 w-3.5 text-[#a1a1a6]" strokeWidth={1.6} aria-hidden="true" />
                          <span>Scoped to {activeSlot.scope}</span>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 text-[12px] text-[#8e8e95]">
                      Unrequested streams never reach the extension runtime.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connected horizontal socket rail inside the same viewport frame */}
        <div className="mt-8">
          <div className="relative">
            <div
              className="pointer-events-none absolute top-1/2 right-0 left-0 hidden h-px -translate-y-1/2 bg-white/[0.12] md:block"
              aria-hidden="true"
            />
            <div
              className="relative grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-6 md:gap-3"
              role="group"
              aria-label="Nexus socket ecosystem"
            >
              {SOCKET_RAIL.map((socket) => {
                const selected = inspectedSocketId === socket.id;
                return (
                  <button
                    key={socket.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setInspectedSocketId((cur) => (cur === socket.id ? null : socket.id));
                      setActiveSlotId(socket.id);
                    }}
                    className={`cursor-pointer rounded-full border px-3 py-2 text-center text-[13px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a] ${
                      selected
                        ? "border-[#f0b54a]/55 bg-[#16161a] text-[#f5f5f7]"
                        : "border-white/[0.13] bg-[#0b0b0e] text-[#d1d1d6] hover:border-white/[0.26] hover:text-[#f5f5f7]"
                    }`}
                  >
                    <span className="font-normal">{socket.name}</span>
                    {socket.status ? (
                      <>
                        {" "}
                        <span className={socket.live ? "text-[#a1a1a6]" : "text-[#8e8e95]"}>
                          ({socket.status})
                        </span>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3.5 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-[12.5px] leading-[1.5] text-[#8e8e95]">
              {inspectedSocket ? (
                <>
                  <span className="font-medium text-[#d1d1d6]">{inspectedSocket.name}</span> —{" "}
                  {inspectedSocket.summary}
                </>
              ) : (
                "Interactive workspace preview using sample data"
              )}
            </p>
            <div className="flex shrink-0 items-center gap-3.5 text-[13.5px]">
              <a
                href="#waitlist"
                className="text-[#d1d1d6] transition-colors hover:text-[#f5f5f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a]"
              >
                Join waitlist
              </a>
              <span className="h-3.5 w-px bg-white/[0.18]" aria-hidden="true" />
              <Link
                href="/signup"
                className="text-[#a1a1a6] transition-colors hover:text-[#f5f5f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
