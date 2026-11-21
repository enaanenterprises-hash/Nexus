"use client";

import { AtlasConduit } from "./FilamentVisuals";

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

export function IntegrationsAtlas() {
  return (
    <section
      id="integrations"
      className="scroll-mt-24 border-y border-white/[0.08] bg-[#111216] px-6 py-20 sm:px-10 lg:px-14 lg:py-24"
      aria-label="Integrations"
    >
      <div className="mx-auto max-w-[1280px]">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <h2 className="font-editorial max-w-[20ch] text-[clamp(2.1rem,3.8vw,3.2rem)] font-normal leading-[1.08] tracking-[-0.032em] text-[#f5f5f7] [text-wrap:balance]">
            Connected today, expanding across your stack
          </h2>
          <div className="flex items-center gap-6 text-[13px] text-[#a1a1a6]">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#22c55e]" aria-hidden="true" />
              <span>Live in beta</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full border border-white/35" aria-hidden="true" />
              <span>Planned</span>
            </span>
          </div>
        </div>

        {/* Optical 4-stream golden convergence graphic feeding into the 4 service columns */}
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
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#22c55e]" aria-label="Live" />
                    ) : (
                      <span className="text-[12px] text-[#8e8e95]">Planned</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
