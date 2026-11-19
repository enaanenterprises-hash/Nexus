"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { AtlasConduit, ClosingSingularity, VaultGeometry } from "./FilamentVisuals";
import { WaitlistForm } from "./WaitlistForm";

type ServiceEntry = {
  name: string;
  live: boolean;
};

type ServiceGroup = {
  heading: string;
  items: ServiceEntry[];
};

const SERVICE_ATLAS: ServiceGroup[] = [
  {
    heading: "Mail & Calendar",
    items: [
      { name: "Google Calendar", live: true },
      { name: "Gmail & Compose", live: true },
      { name: "Google Tasks", live: true },
      { name: "Outlook", live: false },
      { name: "Google Drive", live: false },
      { name: "OneDrive", live: false },
    ],
  },
  {
    heading: "Engineering & Alerts",
    items: [
      { name: "GitHub", live: true },
      { name: "Vercel", live: true },
      { name: "Uptime Monitors", live: true },
      { name: "Telegram Bot", live: true },
      { name: "Linear", live: false },
      { name: "Slack", live: false },
    ],
  },
  {
    heading: "Telemetry & Life",
    items: [
      { name: "Weather Observatory", live: true },
      { name: "Night Sky", live: true },
      { name: "Formula 1", live: true },
      { name: "Crypto Markets", live: true },
      { name: "Strava", live: true },
      { name: "Oura & WHOOP", live: false },
    ],
  },
  {
    heading: "Media & Workspaces",
    items: [
      { name: "Spotify", live: true },
      { name: "Recording Studio", live: true },
      { name: "Research Reader", live: true },
      { name: "Study Socket", live: false },
      { name: "Call Socket", live: false },
      { name: "Notion & Home Assistant", live: false },
    ],
  },
];

const GUARANTEES = [
  {
    title: "Ephemeral network sessions",
    body: "Live conversations stay in your browser session and clear when you leave. Nothing is stored in a chat log or harvested to train public models.",
  },
  {
    title: "AES-256-GCM credential vault",
    body: "OAuth tokens and API keys are encrypted server-side before storage and never sent back to the browser. Unlinking a connector wipes its synced cache.",
  },
  {
    title: "Capability-gated sockets",
    body: "Every extension declares exact read and annotate scopes up front. A receipt ledger cannot see private emails or unrelated workspaces.",
  },
] as const;

export function EcosystemAtlas() {
  const [hoveredGuarantee, setHoveredGuarantee] = useState<number | null>(null);

  return (
    <>
      {/* Band 4: Dense Swiss connector index + optical conduit + Vault geometry security ledger */}
      <section
        id="integrations"
        className="scroll-mt-24 bg-[#050507] px-6 py-20 sm:px-10 lg:px-14 lg:py-28"
        aria-label="Integrations and security"
      >
        <div className="mx-auto max-w-[1280px]">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <h2 className="font-editorial max-w-[20ch] text-[clamp(2.1rem,3.8vw,3.2rem)] font-normal leading-[1.08] tracking-[-0.032em] text-[#f5f5f7] [text-wrap:balance]">
              Connected today, expanding across your stack
            </h2>
            <div className="flex items-center gap-6 text-[13px] text-[#a1a1a6]">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#f0b54a]" aria-hidden="true" />
                <span>Live in beta</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 rounded-full border border-white/35" aria-hidden="true" />
                <span>Planned</span>
              </span>
            </div>
          </div>

          {/* Optical 4-stream convergence conduit feeding into the 4 service columns */}
          <div className="mt-8 h-[72px] w-full sm:h-[96px]" aria-hidden="true">
            <AtlasConduit theme="dark" />
          </div>

          {/* 4-column borderless directory */}
          <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICE_ATLAS.map((group) => (
              <div key={group.heading} className="border-t border-white/[0.11] pt-5">
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#f5f5f7]">{group.heading}</h3>
                <ul className="mt-4 space-y-2.5 text-[14px]">
                  {group.items.map((item) => (
                    <li key={item.name} className="flex items-center justify-between gap-3">
                      <span className={item.live ? "text-[#e4e4e9]" : "text-[#8e8e95]"}>{item.name}</span>
                      {item.live ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#f0b54a]" aria-label="Live" />
                      ) : (
                        <span className="text-[12px] text-[#8e8e95]">Planned</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Asymmetric privacy & security specification ledger paired with VaultGeometry */}
          <div
            id="security"
            className="mt-20 grid scroll-mt-24 grid-cols-1 gap-10 border-t border-white/[0.09] pt-14 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:gap-16"
          >
            <div className="flex flex-col justify-between">
              <div>
                <h3 className="font-editorial text-[clamp(1.75rem,2.7vw,2.3rem)] font-normal leading-[1.12] tracking-[-0.028em] text-[#f5f5f7]">
                  Private by architecture
                </h3>
                <p className="mt-3 max-w-[36ch] text-[14.5px] leading-[1.65] text-[#a1a1a6]">
                  Every credential, live conversation, and extension boundary is enforced server-side.
                </p>
                <Link
                  href="/security"
                  className="group mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#f5f5f7] transition-colors hover:text-[#f0b54a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a]"
                >
                  <span className="gal-link-underline">Read full security spec</span>
                  <ArrowUpRight
                    className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    strokeWidth={1.7}
                    aria-hidden="true"
                  />
                </Link>
              </div>

              <div className="mt-6 h-[156px] w-full max-w-[340px]">
                <VaultGeometry activeIndex={hoveredGuarantee} theme="dark" />
              </div>
            </div>

            <div
              className="divide-y divide-white/[0.09]"
              onMouseLeave={() => setHoveredGuarantee(null)}
            >
              {GUARANTEES.map((item, idx) => {
                const active = hoveredGuarantee === idx;
                return (
                  <div
                    key={item.title}
                    onMouseEnter={() => setHoveredGuarantee(idx)}
                    onFocus={() => setHoveredGuarantee(idx)}
                    onBlur={() => setHoveredGuarantee(null)}
                    tabIndex={0}
                    className={`grid cursor-default grid-cols-1 gap-2 outline-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f0b54a] sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-8 ${
                      idx === 0 ? "pb-6" : "py-6"
                    }`}
                  >
                    <h4
                      className={`text-[15.5px] font-medium transition-colors duration-200 ${
                        active ? "text-[#f0b54a]" : "text-[#f5f5f7]"
                      }`}
                    >
                      {item.title}
                    </h4>
                    <p className="text-[14.5px] leading-[1.66] text-[#a1a1a6]">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Band 5: Panoramic horizon singularity crowning the Open Beta closing band */}
      <section
        id="waitlist"
        className="scroll-mt-24 border-t border-white/[0.08] bg-black pt-0 pb-24 lg:pb-28"
        aria-label="Open beta access"
      >
        <div className="h-[140px] w-full sm:h-[175px]" aria-hidden="true">
          <ClosingSingularity theme="dark" />
        </div>

        <div className="mx-auto flex max-w-[600px] flex-col items-center px-6 pt-3 text-center sm:px-10">
          <h2 className="font-editorial text-[clamp(2.35rem,4.5vw,3.65rem)] font-normal leading-[1.06] tracking-[-0.035em] text-[#f5f5f7] [text-wrap:balance]">
            Start in open beta
          </h2>
          <p className="mt-4 max-w-[46ch] text-[16px] leading-[1.65] text-[#a1a1a6]">
            The core environment, Command, and your first two extension sockets are free during open beta. Pro sockets
            are included in early preview with no subscription or card required.
          </p>

          <div className="mt-9 w-full max-w-[460px]">
            <WaitlistForm theme="dark" />
          </div>

          <p className="mt-6 text-[14px] text-[#8e8e95]">
            Already invited?{" "}
            <Link
              href="/signup"
              className="font-medium text-[#f5f5f7] underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-[#f0b54a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0b54a]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
