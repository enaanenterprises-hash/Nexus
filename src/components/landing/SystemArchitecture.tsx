"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { EquilibriumCore, OrbitalHorizon } from "./FilamentVisuals";

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

type RoadmapStepId = "cockpit" | "automations" | "workspaces" | "sdk";

type RoadmapStep = {
  id: RoadmapStepId;
  title: string;
  status: string;
  caption: string;
  summary: string;
  detail: string;
  surfaces: string[];
};

const ROADMAP_FLOW: RoadmapStep[] = [
  {
    id: "cockpit",
    title: "Every feed on one expandable board",
    status: "Live in beta",
    caption: "Live external feeds converging into one workspace",
    summary:
      "Arrange Gmail, 30-day Google Calendar, Tasks, GitHub, Weather, Night Sky, Markets, and Formula 1 on a 4×2 modular board.",
    detail:
      "Click any preview tile to expand it into a full-screen workspace—read rich HTML mail, browse a full month, or inspect live race timing without opening another tab.",
    surfaces: ["Command 4×2 board", "30-day Calendar", "Two-pane Gmail", "Encrypted vault"],
  },
  {
    id: "automations",
    title: "Services coordinate automatically",
    status: "Live · expanding",
    caption: "Deterministic rule relays across connected accounts",
    summary: "Built-in recipes link your accounts deterministically—no prompt engineering, no fragile webhook glue.",
    detail:
      "Today: Deep work focus blocks, receipt detection to Ledger, failed Vercel deploy alerts to Telegram, and Strava goal completion. Next: Outlook, Slack, Linear, Notion, and Home Assistant triggers.",
    surfaces: ["Deep work mode", "Receipt routing", "Deploy alerts", "Planned enterprise connectors"],
  },
  {
    id: "workspaces",
    title: "Studio, Research, Study, and Call",
    status: "Studio & Research live · Study & Call planned",
    caption: "Two live first-party sockets · two planned orbital workspaces",
    summary: "Standalone applications wired into the same core so work recorded in one room flows cleanly into the next.",
    detail:
      "Record and layer multi-track audio in Studio with cloud sync, clip tracker-free sources in Research, and—on our roadmap—turn lectures and saved highlights into Study decks or live Call briefs.",
    surfaces: ["Studio Record & Edit", "Brave Search Reader", "Study decks (planned)", "Call socket (planned)"],
  },
  {
    id: "sdk",
    title: "Third-party nodes on a public contract",
    status: "SDK v1 live · catalog planned",
    caption: "Capability-scoped nodes radiating from the shared runtime",
    summary: "Build private personal tools or share community workspaces against a typed TypeScript extension contract.",
    detail:
      "Every node declares its exact capability manifest up front—reading only the shared content types you approve—so Nexus grows into your personal OS without turning into an opaque plugin store.",
    surfaces: ["defineExtension()", "Capability scoping", "2 free sockets", "Pro multi-socket runtime"],
  },
];

export function SystemArchitecture() {
  const [hoveredPrinciple, setHoveredPrinciple] = useState<number | null>(null);
  const [activeStepId, setActiveStepId] = useState<RoadmapStepId>("cockpit");

  const activeStep = ROADMAP_FLOW.find((s) => s.id === activeStepId) ?? ROADMAP_FLOW[0];

  return (
    <>
      {/* Band 2: Asymmetric editorial principles paired with optical Equilibrium Core */}
      <section
        id="philosophy"
        className="scroll-mt-24 bg-white px-6 py-20 sm:px-10 lg:px-14 lg:py-28"
        aria-label="Design philosophy"
      >
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <div className="flex flex-col justify-between">
            <div className="max-w-[440px]">
              <h2 className="font-editorial text-[clamp(2.1rem,3.8vw,3.2rem)] font-normal leading-[1.08] tracking-[-0.032em] text-[#0e0f12] [text-wrap:balance]">
                Built to stay quiet until you need it
              </h2>
              <p className="mt-4 text-[15.5px] leading-[1.65] text-[#52545d]">
                Software should answer when asked and stay calm the rest of the day. Every layer of Nexus keeps the same
                restraint.
              </p>
            </div>

            <div className="mt-8 h-[210px] w-full max-w-[440px] sm:h-[240px]">
              <EquilibriumCore activeIndex={hoveredPrinciple} theme="light" />
            </div>
          </div>

          <div
            className="divide-y divide-[#0e0f12]/[0.09] border-y border-[#0e0f12]/[0.09]"
            onMouseLeave={() => setHoveredPrinciple(null)}
          >
            {PRINCIPLES.map((item, idx) => {
              const active = hoveredPrinciple === idx;
              return (
                <div
                  key={item.title}
                  onMouseEnter={() => setHoveredPrinciple(idx)}
                  onFocus={() => setHoveredPrinciple(idx)}
                  onBlur={() => setHoveredPrinciple(null)}
                  tabIndex={0}
                  className="grid cursor-default grid-cols-1 gap-3 py-6 outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910] sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-8 sm:py-8"
                >
                  <h3
                    className={`text-[16px] font-medium leading-[1.35] tracking-[-0.015em] transition-colors duration-200 ${
                      active ? "text-[#9a6910]" : "text-[#0e0f12]"
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p className="max-w-[54ch] text-[15px] leading-[1.68] text-[#52545d]">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Band 3: Full planned vision & interactive roadmap with live morphing Orbital Horizon */}
      <section
        id="roadmap"
        className="scroll-mt-24 border-y border-[#0e0f12]/[0.07] bg-[#f7f6f2] px-6 py-20 sm:px-10 lg:px-14 lg:py-28"
        aria-label="Full platform roadmap"
      >
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-16">
          <div className="flex flex-col justify-between">
            <div>
              <h2 className="font-editorial text-[clamp(2.1rem,3.8vw,3.2rem)] font-normal leading-[1.08] tracking-[-0.032em] text-[#0e0f12] [text-wrap:balance]">
                Where Nexus is going
              </h2>
              <p className="mt-6 max-w-[46ch] text-[15.5px] leading-[1.7] text-[#52545d]">
                Personal computing splintered into dozens of single-purpose tabs that cannot share context without
                copy-pasting or handing every click to a cloud model.
              </p>
              <p className="mt-4 max-w-[46ch] text-[15.5px] leading-[1.7] text-[#52545d]">
                Nexus starts with a working daily foundation—Command, Recording Studio, Research, and a typed extension
                runtime—and scales outward into a complete modular environment where your calendar, mail, audio,
                study materials, calls, and custom tools all inhabit one calm room.
              </p>
            </div>

            <div className="mt-8">
              <div className="h-[195px] w-full max-w-[460px] sm:h-[215px]">
                <OrbitalHorizon activeStep={activeStepId} theme="light" />
              </div>
              <p className="mt-2 text-[13px] text-[#636570]">{activeStep.caption}</p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-[#0e0f12]/[0.08] pt-6 text-[14px]">
              <Link
                href="/about"
                className="group inline-flex items-center gap-1.5 font-medium text-[#0e0f12] transition-colors hover:text-[#9a6910] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
              >
                <span className="gal-link-underline">Read the philosophy</span>
                <ArrowUpRight
                  className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
              </Link>
              <Link
                href="/security"
                className="group inline-flex items-center gap-1.5 text-[#52545d] transition-colors hover:text-[#0e0f12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
              >
                <span className="gal-link-underline">Security architecture</span>
                <ArrowUpRight
                  className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
              </Link>
            </div>
          </div>

          <div className="divide-y divide-[#0e0f12]/[0.09] border-y border-[#0e0f12]/[0.09]">
            {ROADMAP_FLOW.map((step) => {
              const isOpen = step.id === activeStepId;
              return (
                <div key={step.id} className="py-5 sm:py-6">
                  <button
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    aria-expanded={isOpen}
                    className="group flex w-full cursor-pointer flex-col items-start gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910]"
                  >
                    <div className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="text-[20px] font-medium tracking-[-0.02em] text-[#0e0f12] transition-colors duration-150 group-hover:text-[#9a6910] sm:text-[21px]">
                        {step.title}
                      </h3>
                      <span
                        className={`shrink-0 text-[12.5px] font-medium transition-colors ${
                          isOpen ? "text-[#9a6910]" : "text-[#636570] group-hover:text-[#0e0f12]"
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[60ch] text-[15px] leading-[1.6] text-[#52545d]">{step.summary}</p>
                  </button>

                  <div className="gal-accordion-grid" data-open={isOpen ? "true" : "false"}>
                    <div className="gal-accordion-inner">
                      <div className="mt-4 border-t border-[#0e0f12]/[0.07] pt-3.5">
                        <p className="max-w-[58ch] text-[14.5px] leading-[1.65] text-[#2c2e35]">{step.detail}</p>
                        <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[#52545d]">
                          {step.surfaces.map((surface) => (
                            <span key={surface} className="inline-flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#c9932c]" aria-hidden="true" />
                              <span>{surface}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
