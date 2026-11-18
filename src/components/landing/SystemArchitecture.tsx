"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const PRINCIPLES = [
  {
    title: "One conversational core",
    body: "Speak or type from the center of your workspace. Nexus reads context from your connected feeds and active sockets, clears when you leave the tab, and stays out of your way when you prefer to work directly.",
  },
  {
    title: "Automations that run on rules",
    body: "Connect an account once and wire predictable rules between services—booking a focus block starts Spotify and mutes alerts, a failed Vercel deploy opens a task and alerts Telegram, and Gmail receipts route straight to Ledger.",
  },
  {
    title: "Full applications, not cramped widgets",
    body: "Every socket hosts a dedicated workspace—like the two-page Recording Studio DAW or the tracker-free Research reader—passing typed records over one permissioned bus so future workspaces snap straight in.",
  },
] as const;

type RoadmapStep = {
  id: string;
  title: string;
  status: string;
  summary: string;
  detail: string;
  surfaces: string[];
};

const ROADMAP_FLOW: RoadmapStep[] = [
  {
    id: "cockpit",
    title: "Every feed on one expandable board",
    status: "Live in beta",
    summary:
      "Arrange Gmail, 30-day Google Calendar, Tasks, GitHub, Weather, Night Sky, Markets, and Formula 1 on a 4×2 obsidian board.",
    detail:
      "Click any preview tile to expand it into a full-screen workspace—read rich HTML mail, browse a full month, or inspect live race timing without opening another tab.",
    surfaces: ["Command 4×2 board", "30-day Calendar", "Two-pane Gmail", "Encrypted vault"],
  },
  {
    id: "automations",
    title: "Services coordinate automatically",
    status: "Live · expanding",
    summary: "Built-in recipes link your accounts deterministically—no prompt engineering, no fragile webhook glue.",
    detail:
      "Today: Deep work focus blocks, receipt detection to Ledger, failed Vercel deploy alerts to Telegram, and Strava goal completion. Next: Outlook, Slack, Linear, Notion, and Home Assistant triggers.",
    surfaces: ["Deep work mode", "Receipt routing", "Deploy alerts", "Planned enterprise connectors"],
  },
  {
    id: "workspaces",
    title: "Studio, Research, Study, and Call",
    status: "Studio & Research live · Study & Call planned",
    summary: "Standalone applications wired into the same core so work recorded in one room flows cleanly into the next.",
    detail:
      "Record and layer multi-track audio in Studio with cloud sync, clip tracker-free sources in Research, and—on our roadmap—turn lectures and saved highlights into Study decks or live Call briefs.",
    surfaces: ["Studio Record & Edit", "Brave Search Reader", "Study decks (planned)", "Call socket (planned)"],
  },
  {
    id: "sdk",
    title: "Third-party nodes on a public contract",
    status: "SDK v1 live · catalog planned",
    summary: "Build private personal tools or share community workspaces against a typed TypeScript extension contract.",
    detail:
      "Every node declares its exact capability manifest up front—reading only the shared content types you approve—so Nexus grows into your personal OS without turning into an opaque plugin store.",
    surfaces: ["defineExtension()", "Capability scoping", "2 free sockets", "Pro multi-socket runtime"],
  },
];

export function SystemArchitecture() {
  const [activeStepId, setActiveStepId] = useState<string>(ROADMAP_FLOW[0].id);

  return (
    <>
      {/* Spine connector bridge from Band 1 to Band 2 */}
      <div className="flex justify-center bg-black" aria-hidden="true">
        <div className="h-14 w-px bg-gradient-to-b from-white/[0.12] via-[#f0b54a]/22 to-white/[0.08]" />
      </div>

      {/* Band 2: Asymmetric editorial principles (no 3-column icon-card scaffold) */}
      <section className="bg-black px-6 py-20 sm:px-10 lg:px-14 lg:py-24" aria-label="Design philosophy">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <div className="max-w-[440px]">
            <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-light leading-[1.08] tracking-[-0.03em] text-[#f5f5f7] [text-wrap:balance]">
              Built to stay quiet until you need it
            </h2>
            <p className="mt-4 text-[15px] leading-[1.65] text-[#a1a1a6]">
              Software should answer when asked and stay calm the rest of the day. Every layer of Nexus keeps the same
              restraint.
            </p>
          </div>

          <div className="divide-y divide-white/[0.1] border-y border-white/[0.1]">
            {PRINCIPLES.map((item) => (
              <div
                key={item.title}
                className="grid grid-cols-1 gap-3 py-6 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-8 sm:py-7"
              >
                <h3 className="text-[16px] font-medium leading-[1.35] tracking-[-0.015em] text-[#f5f5f7]">
                  {item.title}
                </h3>
                <p className="max-w-[54ch] text-[15px] leading-[1.68] text-[#a1a1a6]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Spine connector bridge into Band 3 */}
      <div className="flex justify-center bg-black" aria-hidden="true">
        <div className="h-12 w-px bg-gradient-to-b from-white/[0.08] to-[#f0b54a]/30" />
      </div>

      {/* Band 3: Full planned vision & interactive roadmap on matte obsidian */}
      <section
        className="border-y border-white/[0.08] bg-[#0a0a0c] px-6 py-20 sm:px-10 lg:px-14 lg:py-28"
        aria-label="Full platform roadmap"
      >
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-16">
          <div className="flex flex-col justify-between">
            <div>
              <h2 className="text-[clamp(2rem,3.6vw,3rem)] font-light leading-[1.08] tracking-[-0.03em] text-[#f5f5f7] [text-wrap:balance]">
                Where Nexus is going
              </h2>
              <p className="mt-6 max-w-[46ch] text-[16px] leading-[1.7] text-[#a1a1a6]">
                Personal computing splintered into dozens of single-purpose tabs that cannot share context without
                copy-pasting or handing every click to a cloud model.
              </p>
              <p className="mt-4 max-w-[46ch] text-[16px] leading-[1.7] text-[#a1a1a6]">
                Nexus starts with a working daily foundation—Command, Recording Studio, Research, and a typed extension
                runtime—and scales outward into a complete modular environment where your calendar, mail, audio,
                study materials, calls, and custom tools all inhabit one calm room.
              </p>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-6 border-t border-white/[0.08] pt-6 text-[14px]">
              <Link
                href="/about"
                className="inline-flex items-center gap-1.5 text-[#f5f5f7] transition-colors hover:text-[#f0b54a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a]"
              >
                <span>Read the philosophy</span>
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
              </Link>
              <Link
                href="/security"
                className="inline-flex items-center gap-1.5 text-[#a1a1a6] transition-colors hover:text-[#f5f5f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a]"
              >
                <span>Security architecture</span>
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="divide-y divide-white/[0.09] border-y border-white/[0.09]">
            {ROADMAP_FLOW.map((step) => {
              const isOpen = step.id === activeStepId;
              return (
                <div key={step.id} className="py-5 sm:py-6">
                  <button
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    aria-expanded={isOpen}
                    className="group flex w-full cursor-pointer flex-col items-start gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f0b54a]"
                  >
                    <div className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="text-[20px] font-normal tracking-[-0.02em] text-[#f5f5f7] sm:text-[22px]">
                        {step.title}
                      </h3>
                      <span
                        className={`shrink-0 text-[12px] transition-colors ${
                          isOpen ? "text-[#f0b54a]" : "text-[#8e8e95] group-hover:text-[#b4b4bc]"
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[60ch] text-[15px] leading-[1.6] text-[#a1a1a6]">{step.summary}</p>
                  </button>

                  {isOpen ? (
                    <div className="mt-4 border-t border-white/[0.07] pt-3.5">
                      <p className="max-w-[58ch] text-[14px] leading-[1.65] text-[#c7c7cc]">{step.detail}</p>
                      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[#a1a1a6]">
                        {step.surfaces.map((surface) => (
                          <span key={surface} className="inline-flex items-center gap-2">
                            <span className="h-1 w-1 rounded-full bg-[#f0b54a]/80" aria-hidden="true" />
                            <span>{surface}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
