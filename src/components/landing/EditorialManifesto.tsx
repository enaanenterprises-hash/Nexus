"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

type MedallionId = "workspace" | "feeds" | "privacy";

const FEED_CRESTS = [
  {
    id: "command",
    label: "Command board — Gmail, 30-day Calendar, GitHub, Weather, and Formula 1 on one 4×2 surface.",
  },
  {
    id: "studio",
    label: "Recording Studio — Multi-track browser DAW synced to private cloud storage.",
  },
  {
    id: "research",
    label: "Research Reader — Built-in Brave Search browser that saves clean, tracker-free highlights.",
  },
] as const;

export function EditorialManifesto() {
  const [selectedMedallion, setSelectedMedallion] = useState<MedallionId | null>(null);
  const [leadCrestIndex, setLeadCrestIndex] = useState<number>(0);

  const activeFeedCrest = FEED_CRESTS[leadCrestIndex]!;

  const caption =
    selectedMedallion === "workspace"
      ? "One expandable environment — switch between Command, Studio, Research, and modular sockets in a single click."
      : selectedMedallion === "feeds"
        ? activeFeedCrest.label
        : selectedMedallion === "privacy"
          ? "AES-256-GCM server-side credential vault, capability-scoped sockets, and ephemeral sessions cleared on exit."
          : "Select any emblem above to inspect the architecture behind Nexus.";

  const captionHref =
    selectedMedallion === "privacy" ? "#security" : selectedMedallion ? "#workspace" : null;
  const captionCta =
    selectedMedallion === "privacy" ? "Inspect security" : selectedMedallion ? "See workspace" : null;

  return (
    <section
      aria-label="What Nexus does"
      className="bg-white px-6 py-20 sm:px-10 sm:py-24 lg:px-14 lg:py-28"
    >
      <div className="mx-auto flex max-w-[920px] flex-col items-center text-center">
        <p className="font-editorial text-[clamp(2rem,4.7vw,4.05rem)] font-normal leading-[1.11] tracking-[-0.036em] text-[#0e0f12] [text-wrap:balance]">
          <span>Nexus</span>
          {/* Inline Medallion 1: Sculptural Obsidian & Crisp White Action Circle */}
          <a
            href="#workspace"
            onMouseEnter={() => setSelectedMedallion("workspace")}
            onFocus={() => setSelectedMedallion("workspace")}
            aria-label="Jump to interactive Nexus workspace"
            className="mx-[0.16em] inline-flex h-[0.9em] w-[0.9em] -translate-y-[0.06em] items-center justify-center rounded-full bg-[#0e0f12] align-middle text-white shadow-[0_6px_16px_-6px_rgba(14,15,18,0.45)] transition-transform duration-200 hover:scale-105 hover:bg-[#1e2028] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910]"
          >
            <ArrowRight className="h-[0.46em] w-[0.46em]" strokeWidth={2.2} aria-hidden="true" />
          </a>
          <span>unifies your tools into one calm room powered by</span>
          {/* Inline Medallion 2: 3 Overlapping Nexus Workspace Seals (click cycles lead seal) */}
          <button
            type="button"
            onClick={() => {
              setSelectedMedallion("feeds");
              setLeadCrestIndex((i) => (i + 1) % FEED_CRESTS.length);
            }}
            onMouseEnter={() => setSelectedMedallion("feeds")}
            aria-label="Cycle Nexus workspace emblems"
            className="group mx-[0.18em] inline-flex -translate-y-[0.06em] cursor-pointer items-center align-middle transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910]"
          >
            {/* Seal 1: Command Calendar/Grid */}
            <span
              className={`relative flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-white bg-[#14151a] text-[#f0c05a] shadow-[0_4px_12px_-4px_rgba(14,15,18,0.3)] transition-transform duration-200 ${
                leadCrestIndex === 0 ? "z-30 scale-105" : "z-10"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[0.46em] w-[0.46em]" fill="none" aria-hidden="true">
                <rect x="3.5" y="4.5" width="7" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="13.5" y="4.5" width="7" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                <rect x="3.5" y="13.5" width="17" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
              </svg>
            </span>

            {/* Seal 2: Recording Studio Waveform */}
            <span
              className={`relative -ml-[0.26em] flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-white bg-[#9a6910] text-[#fffaf0] shadow-[0_4px_12px_-4px_rgba(154,105,16,0.38)] transition-transform duration-200 ${
                leadCrestIndex === 1 ? "z-30 scale-105" : "z-20"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[0.48em] w-[0.48em]" fill="none" aria-hidden="true">
                <path
                  d="M4 12v0M7.5 8.5v7M11 5.5v13M14.5 8v8M18 10v4M21 12v0"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>

            {/* Seal 3: Research Reader Compass */}
            <span
              className={`relative -ml-[0.26em] flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-white bg-[#f3efe6] text-[#86590c] shadow-[0_4px_12px_-4px_rgba(14,15,18,0.18)] ring-1 ring-inset ring-[#9a6910]/25 transition-transform duration-200 ${
                leadCrestIndex === 2 ? "z-30 scale-105" : "z-10"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-[0.48em] w-[0.48em]" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.75" />
                <path d="m14.8 9.2-1.5 4.1-4.1 1.5 1.5-4.1 4.1-1.5Z" fill="currentColor" />
              </svg>
            </span>
          </button>
          <span>your own connected feeds. It runs without ads, clears live chats on exit, and keeps</span>
          {/* Inline Medallion 3: Frosted Pearl & Burnished Gold Fingerprint Privacy Crest */}
          <button
            type="button"
            onClick={() => setSelectedMedallion((cur) => (cur === "privacy" ? null : "privacy"))}
            onMouseEnter={() => setSelectedMedallion("privacy")}
            aria-label="Inspect Nexus privacy guarantees"
            className="mx-[0.16em] inline-flex h-[0.94em] w-[0.94em] -translate-y-[0.06em] cursor-pointer items-center justify-center rounded-full bg-[#f5f2ea] align-middle text-[#9a6910] ring-1 ring-inset ring-[#9a6910]/20 transition-transform duration-200 hover:scale-105 hover:ring-[#9a6910]/45 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910]"
          >
            <svg viewBox="0 0 32 32" className="h-[0.66em] w-[0.66em]" fill="none" aria-hidden="true">
              <path
                d="M16 6.5c-4.95 0-9 4.05-9 9 0 2.55.55 4.85 1.45 6.8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M16 6.5c4.95 0 9 4.05 9 9 0 2.2-.4 4.2-1.15 5.95"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M16 9.8c-3.15 0-5.7 2.55-5.7 5.7 0 3.05.9 5.9 2.45 8.2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M16 9.8c3.15 0 5.7 2.55 5.7 5.7 0 2.65-.65 5.15-1.85 7.35"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M16 13.1c-1.35 0-2.4 1.05-2.4 2.4 0 3.1.95 6.1 2.75 8.6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M18.4 15.5c0 2.4-.55 4.85-1.55 7.05"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M16 15.5c0 2.1.45 4.25 1.35 6.15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span>your data private.</span>
        </p>

        {/* Quiet live footnote responding to whichever medallion the visitor inspects */}
        <div
          className="mt-8 flex min-h-[28px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13.5px] leading-[1.5] text-[#636570]"
          aria-live="polite"
        >
          <span>{caption}</span>
          {captionHref && captionCta ? (
            <a
              href={captionHref}
              className="font-medium text-[#9a6910] underline decoration-[#9a6910]/35 underline-offset-4 transition-colors hover:text-[#78500b] hover:decoration-[#78500b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
            >
              {captionCta}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
