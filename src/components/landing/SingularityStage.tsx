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
  Moon,
  Pause,
  PenSquare,
  Play,
  Reply,
  Search,
  SlidersHorizontal,
  Sun,
} from "lucide-react";

type StageLayer = "command" | "studio" | "sockets";
type PreviewTheme = "light" | "dark";

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
  { pos: "4", code: "HAM", teamColor: "#00A19B", gap: "+4.190", sector: "30.275", lap: "1:35.104", fastest: false },
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
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("light");
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
  const dark = previewTheme === "dark";

  // Concentric surface tokens inside the live preview frame (supports both Nexus Gallery Light & Obsidian Dark)
  const frameClass = dark
    ? "border-[#0e0f12] bg-[#0f0f12] shadow-[0_28px_64px_-24px_rgba(14,15,18,0.34)]"
    : "border-[#0e0f12]/[0.1] bg-[#efede8] shadow-[0_24px_60px_-28px_rgba(14,15,18,0.16),0_2px_6px_rgba(14,15,18,0.04)]";
  const cardClass = dark
    ? "border-white/[0.08] bg-[#16161a]"
    : "border-[#0e0f12]/[0.08] bg-white shadow-[0_1px_2px_rgba(14,15,18,0.035)]";
  const inkPrimary = dark ? "text-[#f5f5f7]" : "text-[#0e0f12]";
  const inkSecondary = dark ? "text-[#b4b4bc]" : "text-[#4a4c55]";
  const inkMuted = dark ? "text-[#8e8e95]" : "text-[#636570]";
  const hairline = dark ? "border-white/[0.07]" : "border-[#0e0f12]/[0.08]";
  const goldText = dark ? "text-[#f0b54a]" : "text-[#9a6910]";
  const goldDot = dark ? "bg-[#f0b54a]" : "bg-[#c9932c]";
  const activeLayerMeta = LAYER_ITEMS.find((l) => l.id === activeLayer) ?? LAYER_ITEMS[0];

  return (
    <section
      id="workspace"
      className="relative scroll-mt-24 border-y border-[#0e0f12]/[0.07] bg-[#f7f6f2] px-6 py-16 sm:px-10 lg:px-14 lg:py-24"
      aria-label="Workspace overview"
    >
      <div className="mx-auto max-w-[1280px]">
        {/* Mobile top optical cascade */}
        <div className="h-16 w-full lg:hidden" aria-hidden="true">
          <CascadeFilament activeLayer={activeLayer} theme="light" />
        </div>

        {/* Section header paired with desktop optical filament cascade */}
        <div className="relative pb-8 pt-2 lg:pb-10 lg:pt-8">
          <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true">
            <CascadeFilament activeLayer={activeLayer} theme="light" />
          </div>
          <div className="relative z-10 max-w-[540px]">
            <h2 className="font-editorial text-[clamp(2.15rem,4vw,3.45rem)] font-normal leading-[1.06] tracking-[-0.035em] text-[#0e0f12] [text-wrap:balance]">
              One room for everything you run
            </h2>
            <p className="mt-3.5 max-w-[46ch] text-[15.5px] leading-[1.6] text-[#52545d]">
              Nexus brings your daily tools, web research, recording studio, and modular workspaces onto one shared
              system.
            </p>
          </div>
        </div>

        {/* Asymmetric workstation row: minimal left layer rail + Apple-concentric workspace window */}
        <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:items-start lg:gap-10">
          {/* Layer selector rail */}
          <nav
            aria-label="Nexus workspace layers"
            className="grid grid-cols-3 gap-1.5 rounded-[14px] border border-[#0e0f12]/[0.09] bg-white/80 p-1 lg:grid-cols-1 lg:gap-5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-10"
          >
            {LAYER_ITEMS.map((item) => {
              const isActive = activeLayer === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveLayer(item.id)}
                  aria-pressed={isActive}
                  className={`group flex min-h-[40px] cursor-pointer items-center justify-center rounded-[10px] px-2 py-2 text-center transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910] lg:min-h-0 lg:justify-start lg:gap-3.5 lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0.5 lg:text-left ${
                    isActive
                      ? "bg-[#0e0f12] text-white lg:bg-transparent lg:text-[#0e0f12]"
                      : "text-[#52545d] hover:text-[#0e0f12]"
                  }`}
                >
                  <span
                    className={`hidden h-6 w-[2px] shrink-0 rounded-full transition-colors duration-200 lg:block ${
                      isActive ? "bg-[#9a6910]" : "bg-[#0e0f12]/[0.14] group-hover:bg-[#0e0f12]/[0.35]"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-[13px] font-medium tracking-[-0.01em] lg:text-[20px] lg:font-medium lg:tracking-[-0.02em]">
                    <span className="lg:hidden">{item.shortLabel}</span>
                    <span className="hidden lg:inline">{item.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Concentric Apple HIG workspace frame (outer 22px -> cards 14px -> controls 8px) */}
          <div className={`rounded-[22px] border p-3 transition-colors duration-300 sm:p-4 ${frameClass}`}>
            {/* Minimal window bar with live Gallery Light / Obsidian Dark preview toggle */}
            <div className={`mb-3 flex items-center justify-between gap-3 border-b pb-2.5 ${hairline}`}>
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  <span className={`h-2.5 w-2.5 rounded-full ${dark ? "bg-white/15" : "bg-[#0e0f12]/12"}`} />
                  <span className={`h-2.5 w-2.5 rounded-full ${dark ? "bg-white/15" : "bg-[#0e0f12]/12"}`} />
                  <span className={`h-2.5 w-2.5 rounded-full ${dark ? "bg-white/15" : "bg-[#0e0f12]/12"}`} />
                </div>
                <span className={`text-[12.5px] font-medium ${inkSecondary}`}>
                  Nexus · {activeLayerMeta.label}
                </span>
              </div>

              <div
                className={`inline-flex rounded-full border p-0.5 text-[12px] ${
                  dark ? "border-white/[0.1] bg-[#16161a]" : "border-[#0e0f12]/[0.1] bg-[#f7f6f2]"
                }`}
                role="group"
                aria-label="Preview workspace appearance"
              >
                <button
                  type="button"
                  onClick={() => setPreviewTheme("light")}
                  aria-pressed={!dark}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9a6910] ${
                    !dark ? "bg-white font-medium text-[#0e0f12] shadow-xs" : "text-[#a1a1a6] hover:text-white"
                  }`}
                >
                  <Sun className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTheme("dark")}
                  aria-pressed={dark}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#f0b54a] ${
                    dark ? "bg-[#24242b] font-medium text-[#f5f5f7]" : "text-[#636570] hover:text-[#0e0f12]"
                  }`}
                >
                  <Moon className="h-3 w-3" strokeWidth={1.8} aria-hidden="true" />
                  <span>Dark</span>
                </button>
              </div>
            </div>

            <div key={activeLayer} className="lp-stage-panel">
              {activeLayer === "command" && (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.52fr)]">
                  {/* Left: 30-day November Calendar */}
                  <div className={`flex flex-col justify-between rounded-[14px] border p-4 ${cardClass}`}>
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`text-[16px] font-medium tracking-[-0.015em] ${inkPrimary}`}>November</span>
                        {CALENDAR_EVENTS[selectedDay] ? (
                          <span className={`truncate text-[12px] tabular-nums ${inkMuted}`}>
                            {CALENDAR_EVENTS[selectedDay]}
                          </span>
                        ) : null}
                      </div>

                      <div className={`mt-4 grid grid-cols-7 gap-y-1.5 text-center text-[11px] ${inkMuted}`}>
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
                              className={`relative flex h-8 cursor-pointer items-center justify-center rounded-[8px] text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9a6910] ${
                                isSelected
                                  ? dark
                                    ? "bg-[#2e2e36] font-medium text-[#f5f5f7]"
                                    : "bg-[#0e0f12] font-medium text-white"
                                  : hasEvent
                                    ? dark
                                      ? "font-medium text-[#f5f5f7] hover:bg-white/[0.06]"
                                      : "font-medium text-[#0e0f12] hover:bg-[#0e0f12]/[0.05]"
                                    : dark
                                      ? "text-[#b8b8c0] hover:bg-white/[0.05]"
                                      : "text-[#52545d] hover:bg-[#0e0f12]/[0.04]"
                              }`}
                            >
                              <span>{day}</span>
                              {hasEvent && !isSelected ? (
                                <span
                                  className={`absolute bottom-1 h-1 w-1 rounded-full ${goldDot}`}
                                  aria-hidden="true"
                                />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right column: Top split Gmail cards + Bottom Weather & Formula 1 */}
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
                      {/* Gmail Inbox card */}
                      <div className={`grid grid-cols-[44px_minmax(0,1fr)] overflow-hidden rounded-[14px] border ${cardClass}`}>
                        <div
                          className={`flex flex-col items-center gap-3 border-r py-3.5 ${hairline} ${inkMuted}`}
                          aria-hidden="true"
                        >
                          <Mail className={`h-4 w-4 ${inkPrimary}`} strokeWidth={1.6} />
                          <Inbox className="h-3.5 w-3.5" strokeWidth={1.6} />
                          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.6} />
                          <PenSquare className="h-3.5 w-3.5" strokeWidth={1.6} />
                        </div>

                        <div className="min-w-0 p-3">
                          <div className="mb-2 flex items-center justify-between px-1">
                            <span className={`text-[15px] font-medium tracking-[-0.01em] ${inkPrimary}`}>Gmail</span>
                            <span className={`text-[11px] ${inkMuted}`}>Inbox</span>
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
                                  className={`cursor-pointer rounded-[8px] px-2 py-1.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9a6910] ${
                                    selected
                                      ? dark
                                        ? "bg-[#24242b] text-[#f5f5f7]"
                                        : "bg-[#f3f1ec] text-[#0e0f12]"
                                      : dark
                                        ? "text-[#c7c7cc] hover:bg-white/[0.04]"
                                        : "text-[#4a4c55] hover:bg-[#0e0f12]/[0.035]"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={`flex items-center gap-1.5 truncate text-[12.5px] font-medium ${inkPrimary}`}>
                                      {msg.unread ? (
                                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${goldDot}`} aria-hidden="true" />
                                      ) : null}
                                      <span className="truncate">{msg.sender}</span>
                                    </span>
                                    <span className={`shrink-0 text-[11px] tabular-nums ${inkMuted}`}>{msg.time}</span>
                                  </div>
                                  <p className={`mt-0.5 truncate text-[11.5px] ${inkSecondary}`}>{msg.subject}</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Elevated Gmail reader card */}
                      <div className={`flex flex-col rounded-[14px] border p-3.5 ${cardClass}`}>
                        <div className={`flex items-center justify-between gap-2 text-[11.5px] ${inkMuted}`}>
                          <span className="truncate">
                            {activeMail.sender} · <span className="tabular-nums">{activeMail.time}</span>
                          </span>
                          <div className="flex items-center gap-2" aria-hidden="true">
                            <Reply className="h-3.5 w-3.5" strokeWidth={1.6} />
                            <Forward className="h-3.5 w-3.5" strokeWidth={1.6} />
                          </div>
                        </div>
                        <p className={`mt-2 text-[13.5px] font-medium ${inkPrimary}`}>{activeMail.subject}</p>
                        <div className={`mt-2 space-y-2 text-[12.5px] leading-[1.54] ${inkSecondary}`}>
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
                      <div className={`flex flex-col justify-between rounded-[14px] border p-3.5 ${cardClass}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <span className={`text-[14px] font-medium ${inkPrimary}`}>Weather</span>
                            <div className="mt-1.5 flex items-baseline gap-2">
                              <span className={`text-[36px] font-light leading-none tracking-[-0.04em] tabular-nums ${inkPrimary}`}>
                                11°
                              </span>
                              <span className={`text-[13px] ${inkMuted}`}>Toronto</span>
                            </div>
                          </div>
                          <CloudSun className={`h-7 w-7 ${inkSecondary}`} strokeWidth={1.4} aria-hidden="true" />
                        </div>

                        <div className="mt-4 grid grid-cols-5 gap-1 text-center tabular-nums">
                          {HOURLY_WEATHER.map((slot) => (
                            <div key={slot.label} className="flex flex-col items-center gap-1">
                              <span className={`text-[11px] ${inkMuted}`}>{slot.label}</span>
                              {slot.icon === "partly" ? (
                                <CloudSun className={`h-3.5 w-3.5 ${inkSecondary}`} strokeWidth={1.5} aria-hidden="true" />
                              ) : (
                                <Cloud className={`h-3.5 w-3.5 ${inkSecondary}`} strokeWidth={1.5} aria-hidden="true" />
                              )}
                              <span className={`text-[12px] font-medium ${inkPrimary}`}>{slot.temp}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className={`flex flex-col justify-between rounded-[14px] border p-3.5 ${cardClass}`}>
                        <div className="flex items-baseline justify-between">
                          <span className={`text-[14px] font-medium ${inkPrimary}`}>Formula 1</span>
                          <span className={`text-[12px] ${inkMuted}`}>Las Vegas</span>
                        </div>

                        <div className="mt-3">
                          <div className={`grid grid-cols-[14px_42px_1fr_1fr_1fr] gap-1.5 border-b pb-1.5 text-[11px] ${hairline} ${inkMuted}`}>
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
                                <span className={inkMuted}>{row.pos}</span>
                                <span className={`flex items-center gap-1.5 font-medium ${inkPrimary}`}>
                                  <span
                                    className="h-2.5 w-[2.5px] rounded-full"
                                    style={{ backgroundColor: row.teamColor }}
                                    aria-hidden="true"
                                  />
                                  {row.code}
                                </span>
                                <span className={`text-right ${inkSecondary}`}>{row.gap}</span>
                                <span className={`text-right font-medium ${row.fastest ? goldText : inkSecondary}`}>
                                  {row.sector}
                                </span>
                                <span className={`text-right ${inkPrimary}`}>{row.lap}</span>
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
                  <div className={`flex flex-col justify-between rounded-[14px] border p-4 ${cardClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-[15px] font-medium ${inkPrimary}`}>Studio</span>
                        <div
                          className={`inline-flex rounded-[9px] border p-0.5 text-[12px] ${
                            dark ? "border-white/[0.1] bg-[#0f0f12]" : "border-[#0e0f12]/[0.1] bg-[#f7f6f2]"
                          }`}
                          role="tablist"
                          aria-label="Studio workspace view"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={studioMode === "record"}
                            onClick={() => setStudioMode("record")}
                            className={`cursor-pointer rounded-[7px] px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9a6910] ${
                              studioMode === "record"
                                ? dark
                                  ? "bg-[#24242b] text-[#f5f5f7]"
                                  : "bg-white font-medium text-[#0e0f12] shadow-xs"
                                : inkMuted
                            }`}
                          >
                            Record
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={studioMode === "edit"}
                            onClick={() => setStudioMode("edit")}
                            className={`cursor-pointer rounded-[7px] px-2.5 py-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#9a6910] ${
                              studioMode === "edit"
                                ? dark
                                  ? "bg-[#24242b] text-[#f5f5f7]"
                                  : "bg-white font-medium text-[#0e0f12] shadow-xs"
                                : inkMuted
                            }`}
                          >
                            Edit
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 tabular-nums">
                        <span className={`text-[13px] ${inkMuted}`}>
                          {studioMode === "record" ? "Input ready · 48 kHz" : "00:14:22.4"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setStudioPlaying((p) => !p)}
                          aria-label={studioPlaying ? "Pause preview" : "Play preview"}
                          className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910] ${
                            dark
                              ? "border-white/[0.14] bg-white/[0.04] text-[#f5f5f7] hover:border-white/[0.28]"
                              : "border-[#0e0f12]/[0.14] bg-[#f7f6f2] text-[#0e0f12] hover:border-[#0e0f12]/[0.28]"
                          }`}
                        >
                          {studioMode === "record" ? (
                            <Mic className={`h-3.5 w-3.5 ${goldText}`} strokeWidth={1.7} />
                          ) : studioPlaying ? (
                            <Pause className="h-3.5 w-3.5" strokeWidth={1.7} />
                          ) : (
                            <Play className="h-3.5 w-3.5" strokeWidth={1.7} />
                          )}
                        </button>
                      </div>
                    </div>

                    <div
                      className="relative mt-4 space-y-2"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const pct = Math.max(24, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
                        setPlayheadPct(Math.round(pct));
                      }}
                    >
                      <div
                        className={`pointer-events-none absolute top-0 bottom-0 z-10 w-[1.5px] transition-[left] duration-200 ${goldDot}`}
                        style={{ left: `${playheadPct}%` }}
                        aria-hidden="true"
                      />
                      {STUDIO_TRACKS.map((track) => (
                        <div
                          key={track.id}
                          className={`grid cursor-pointer grid-cols-[108px_minmax(0,1fr)] items-center gap-3 rounded-[9px] border px-3 py-2 ${
                            dark ? "border-white/[0.06] bg-[#111115]" : "border-[#0e0f12]/[0.07] bg-[#faf9f6]"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className={`truncate text-[13px] font-medium ${inkPrimary}`}>{track.name}</p>
                            <p className={`truncate text-[11px] ${inkMuted}`}>{track.role}</p>
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
                                  fill={
                                    dark
                                      ? passed
                                        ? "#e4e4e9"
                                        : "rgba(255,255,255,0.28)"
                                      : passed
                                        ? "#0e0f12"
                                        : "rgba(14,15,18,0.22)"
                                  }
                                />
                              );
                            })}
                          </svg>
                        </div>
                      ))}
                    </div>

                    <div className={`mt-3.5 flex flex-wrap items-center justify-between gap-2 text-[12px] ${inkMuted}`}>
                      <span>Click timeline to move playhead</span>
                      <span>Synced via Supabase Storage</span>
                    </div>
                  </div>

                  {/* Research clean reader */}
                  <div className={`flex flex-col justify-between rounded-[14px] border p-4 ${cardClass}`}>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[15px] font-medium ${inkPrimary}`}>Research</span>
                        <Bookmark className={`h-4 w-4 ${inkMuted}`} strokeWidth={1.6} aria-hidden="true" />
                      </div>

                      <div
                        className={`mt-3 flex items-center gap-2 rounded-[8px] border px-3 py-1.5 text-[12px] ${
                          dark
                            ? "border-white/[0.08] bg-[#0f0f12] text-[#a1a1a6]"
                            : "border-[#0e0f12]/[0.08] bg-[#f7f6f2] text-[#52545d]"
                        }`}
                      >
                        <Search className={`h-3.5 w-3.5 shrink-0 ${inkMuted}`} strokeWidth={1.6} aria-hidden="true" />
                        <span className="truncate">Brave Search · Capability-gated personal systems</span>
                      </div>

                      <article className="mt-4 space-y-2.5">
                        <h3 className={`text-[15px] font-medium leading-[1.3] tracking-[-0.015em] ${inkPrimary}`}>
                          Why personal software breaks into tabs
                        </h3>
                        <p className={`text-[13px] leading-[1.6] ${inkSecondary}`}>
                          Every standalone web app keeps its own search bar, login, and private silo. Reading in one
                          clean view lets you{" "}
                          <mark
                            className={`rounded-[3px] px-1 py-0.5 ${
                              dark ? "bg-[#f0b54a]/22 text-[#f5f5f7]" : "bg-[#c9932c]/18 text-[#0e0f12]"
                            }`}
                          >
                            highlight once and pass typed sources to any permitted socket
                          </mark>{" "}
                          without trackers or manual copy-pasting.
                        </p>
                      </article>
                    </div>

                    <div className={`mt-4 flex items-center justify-between text-[12px] ${inkMuted}`}>
                      <span>SSRF-guarded reader</span>
                      <span className={inkPrimary}>Saved to Systems collection</span>
                    </div>
                  </div>
                </div>
              )}

              {activeLayer === "sockets" && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <div className={`rounded-[14px] border p-4 ${cardClass}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[15px] font-medium ${inkPrimary}`}>Orbital extension slots</span>
                      <span className={`text-[12px] ${inkMuted}`}>2 free · 3 Pro preview</span>
                    </div>

                    <div className={`mt-3 divide-y ${dark ? "divide-white/[0.07]" : "divide-[#0e0f12]/[0.07]"}`}>
                      {SOCKET_RAIL.slice(0, 5).map((slot, idx) => {
                        const active = slot.id === activeSlot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => setActiveSlotId(slot.id)}
                            aria-pressed={active}
                            className={`flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910] ${
                              active ? inkPrimary : `${inkSecondary} hover:${inkPrimary}`
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums ${
                                  active
                                    ? dark
                                      ? "border-[#f0b54a]/60 bg-[#f0b54a]/12 text-[#f0b54a]"
                                      : "border-[#9a6910]/55 bg-[#c9932c]/12 font-medium text-[#9a6910]"
                                    : dark
                                      ? "border-white/[0.12] text-[#8e8e95]"
                                      : "border-[#0e0f12]/[0.14] text-[#636570]"
                                }`}
                              >
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <p className={`text-[14px] font-medium ${inkPrimary}`}>{slot.name}</p>
                                <p className={`truncate text-[12px] ${inkMuted}`}>{slot.scope}</p>
                              </div>
                            </div>
                            <span className={`shrink-0 text-[12px] ${inkMuted}`}>
                              {slot.tier} · {slot.status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className={`flex flex-col justify-between rounded-[14px] border p-4 ${cardClass}`}>
                    <div>
                      <div className={`flex items-center gap-2 ${inkPrimary}`}>
                        <SlidersHorizontal className={`h-4 w-4 ${goldText}`} strokeWidth={1.6} aria-hidden="true" />
                        <span className="text-[15px] font-medium">{activeSlot.name} contract</span>
                      </div>
                      <p className={`mt-2.5 text-[13.5px] leading-[1.6] ${inkSecondary}`}>{activeSlot.summary}</p>
                      <div className={`mt-3.5 space-y-2 border-t pt-3 text-[12px] ${hairline} ${inkSecondary}`}>
                        <div className="flex items-center gap-2">
                          <Check className={`h-3.5 w-3.5 ${goldText}`} strokeWidth={1.8} aria-hidden="true" />
                          <span>Manifest validated on register (apiVersion 1)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Lock className={`h-3.5 w-3.5 ${inkMuted}`} strokeWidth={1.6} aria-hidden="true" />
                          <span>Scoped to {activeSlot.scope}</span>
                        </div>
                      </div>
                    </div>
                    <p className={`mt-4 text-[12px] ${inkMuted}`}>
                      Unrequested streams never reach the extension runtime.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Connected horizontal socket rail */}
        <div className="mt-9">
          <div className="relative">
            <div
              className="pointer-events-none absolute top-1/2 right-0 left-0 hidden h-px -translate-y-1/2 bg-[#0e0f12]/[0.11] md:block"
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
                    className={`min-h-[40px] cursor-pointer rounded-full border px-3 py-2 text-center text-[13px] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910] ${
                      selected
                        ? "border-[#9a6910]/60 bg-white font-medium text-[#0e0f12] shadow-[0_6px_16px_-8px_rgba(154,105,16,0.3)]"
                        : "border-[#0e0f12]/[0.11] bg-white text-[#4a4c55] hover:border-[#0e0f12]/[0.26] hover:text-[#0e0f12]"
                    }`}
                  >
                    <span>{socket.name}</span>
                    {socket.status ? (
                      <>
                        {" "}
                        <span className={socket.live ? "text-[#9a6910]" : "text-[#636570]"}>({socket.status})</span>
                      </>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
            <p className="text-[13px] leading-[1.5] text-[#636570]">
              {inspectedSocket ? (
                <>
                  <span className="font-medium text-[#0e0f12]">{inspectedSocket.name}</span> —{" "}
                  {inspectedSocket.summary}
                </>
              ) : (
                "Interactive workspace preview using sample data"
              )}
            </p>
            <div className="flex shrink-0 items-center gap-3.5 text-[13.5px]">
              <a
                href="#waitlist"
                className="font-medium text-[#0e0f12] transition-colors hover:text-[#9a6910] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
              >
                Join waitlist
              </a>
              <span className="h-3.5 w-px bg-[#0e0f12]/[0.16]" aria-hidden="true" />
              <Link
                href="/signup"
                className="text-[#52545d] transition-colors hover:text-[#0e0f12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
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
