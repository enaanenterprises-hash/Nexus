"use client";

import { useState } from "react";
import { EquilibriumCore, OrbitalHorizon } from "./FilamentVisuals";

const PRINCIPLES = [
  {
    title: "One conversational core",
    body: "Speak or type from the center. Sessions clear cleanly when you leave.",
  },
  {
    title: "Rule-based automations",
    body: "Connect accounts once and wire deterministic relays between your tools.",
  },
  {
    title: "Full isolated workspaces",
    body: "Every socket hosts a dedicated app over one permissioned bus.",
  },
] as const;

type RoadmapStepId = "cockpit" | "automations" | "workspaces" | "sdk";

type RoadmapStep = {
  id: RoadmapStepId;
  title: string;
  status: string;
  summary: string;
  surfaces: string[];
};

const ROADMAP_FLOW: RoadmapStep[] = [
  {
    id: "cockpit",
    title: "Expandable Command board",
    status: "Live in beta",
    summary: "Gmail, 30-day Calendar, Tasks, GitHub, Weather, and live timing on one 4×2 surface.",
    surfaces: ["4×2 board", "30-day Calendar", "Two-pane Gmail"],
  },
  {
    id: "automations",
    title: "Deterministic automations",
    status: "Live · expanding",
    summary: "Focus blocks, receipt routing, and deploy alerts—expanding to Slack, Linear, and Notion.",
    surfaces: ["Focus mode", "Receipt routing", "Deploy alerts"],
  },
  {
    id: "workspaces",
    title: "First-party workspaces",
    status: "Studio & Research live",
    summary: "Multi-track Recording Studio and Research Reader live today; Study and Call sockets next.",
    surfaces: ["Studio DAW", "Research Reader", "Study & Call (planned)"],
  },
  {
    id: "sdk",
    title: "Open extension SDK",
    status: "SDK v1 live",
    summary: "Build personal or community nodes against a typed capability contract.",
    surfaces: ["defineExtension()", "Capability scopes", "Multi-socket Pro"],
  },
];

export function SystemArchitecture() {
  const [hoveredPrinciple, setHoveredPrinciple] = useState<number | null>(null);
  const [activeStepId, setActiveStepId] = useState<RoadmapStepId>("cockpit");

  return (
    <>
      {/* Editorial principles paired with optical Equilibrium Core */}
      <section
        id="philosophy"
        className="scroll-mt-24 border-b border-white/[0.08] bg-[#111216] px-6 py-20 sm:px-10 lg:px-14 lg:py-24"
        aria-label="Design philosophy"
      >
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <div className="flex flex-col justify-between">
            <h2 className="font-editorial max-w-[16ch] text-[clamp(2.05rem,3.6vw,3.05rem)] font-normal leading-[1.08] tracking-[-0.032em] text-[#f5f5f7] [text-wrap:balance]">
              Built to stay quiet until you need it
            </h2>

            <div className="mt-8 h-[196px] w-full max-w-[420px] sm:h-[220px]">
              <EquilibriumCore activeIndex={hoveredPrinciple} theme="dark" />
            </div>
          </div>

          <div
            className="divide-y divide-white/[0.09] border-y border-white/[0.09]"
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
                  className="grid cursor-default grid-cols-1 gap-2 py-6 outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70 sm:grid-cols-[210px_minmax(0,1fr)] sm:gap-8 sm:py-7"
                >
                  <h3
                    className={`text-[15.5px] font-medium leading-[1.35] tracking-[-0.015em] transition-colors duration-200 ${
                      active ? "text-white" : "text-[#e4e4e9]"
                    }`}
                  >
                    {item.title}
                  </h3>
                  <p className="max-w-[50ch] text-[14.5px] leading-[1.6] text-[#9d9da6]">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Platform roadmap paired with live morphing Orbital Horizon */}
      <section
        id="roadmap"
        className="scroll-mt-24 border-b border-white/[0.08] bg-[#111216] px-6 py-20 sm:px-10 lg:px-14 lg:py-24"
        aria-label="Platform roadmap"
      >
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
          <div className="flex flex-col justify-between">
            <div>
              <h2 className="font-editorial text-[clamp(2.05rem,3.6vw,3.05rem)] font-normal leading-[1.08] tracking-[-0.032em] text-[#f5f5f7] [text-wrap:balance]">
                Where Nexus is going
              </h2>
              <p className="mt-4 max-w-[38ch] text-[15px] leading-[1.6] text-[#9d9da6]">
                From a working daily foundation to a complete modular workspace in one room.
              </p>
            </div>

            <div className="mt-8 h-[190px] w-full max-w-[440px] sm:h-[210px]">
              <OrbitalHorizon activeStep={activeStepId} theme="dark" />
            </div>
          </div>

          <div className="divide-y divide-white/[0.09] border-y border-white/[0.09]">
            {ROADMAP_FLOW.map((step) => {
              const isOpen = step.id === activeStepId;
              return (
                <div key={step.id} className="py-5">
                  <button
                    type="button"
                    onClick={() => setActiveStepId(step.id)}
                    aria-expanded={isOpen}
                    className="group flex w-full cursor-pointer flex-col items-start gap-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
                  >
                    <div className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3
                        className={`text-[18.5px] font-medium tracking-[-0.02em] transition-colors duration-150 sm:text-[19.5px] ${
                          isOpen ? "text-white" : "text-[#d6d6dc] group-hover:text-white"
                        }`}
                      >
                        {step.title}
                      </h3>
                      <span
                        className={`shrink-0 text-[12.5px] font-medium transition-colors ${
                          isOpen ? "text-[#e4e4e9]" : "text-[#8a8a93] group-hover:text-[#d1d1d6]"
                        }`}
                      >
                        {step.status}
                      </span>
                    </div>
                  </button>

                  <div className="gal-accordion-grid" data-open={isOpen ? "true" : "false"}>
                    <div className="gal-accordion-inner">
                      <div className="mt-3 space-y-3">
                        <p className="max-w-[54ch] text-[14.5px] leading-[1.6] text-[#a1a1a6]">{step.summary}</p>
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-[#8e8e95]">
                          {step.surfaces.map((surface) => (
                            <span key={surface} className="inline-flex items-center gap-2">
                              <span className="h-1 w-1 rounded-full bg-white/55" aria-hidden="true" />
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
