"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, EyeOff, Lock, ShieldCheck } from "lucide-react";
import { ClosingSingularityCanvas } from "./OpticalCanvases";
import { WaitlistForm } from "./WaitlistForm";

const SEALS = [
  {
    id: "vault",
    label: "AES-256-GCM vault",
    caption:
      "OAuth tokens stay encrypted server-side in AES-256-GCM and never reach your browser.",
  },
  {
    id: "ephemeral",
    label: "Ephemeral AI sessions",
    caption:
      "Live Network chats stay in volatile browser state and clear completely when you leave.",
  },
  {
    id: "scoped",
    label: "Capability-scoped Nodes",
    caption:
      "Every Node declares exact read and write capabilities before mounting on nexusBus.",
  },
] as const;

export function SecurityAndBetaClose() {
  const [activeSeal, setActiveSeal] = useState<number>(0);

  return (
    <>
      <section
        id="security"
        className="scroll-mt-24 border-b border-white/[0.08] bg-[#111216] px-6 py-24 sm:px-10 lg:px-14 lg:py-32"
        aria-label="Security"
      >
        <div className="mx-auto flex max-w-[880px] flex-col items-center text-center">
          <h2 className="font-editorial text-[clamp(1.95rem,4.1vw,3.35rem)] font-normal leading-[1.22] tracking-[-0.034em] text-[#f5f5f7] [text-wrap:balance]">
            <span>Private by architecture:</span>

            <button
              type="button"
              onMouseEnter={() => setActiveSeal(0)}
              onFocus={() => setActiveSeal(0)}
              onClick={() => setActiveSeal(0)}
              aria-pressed={activeSeal === 0}
              aria-label={SEALS[0].label}
              className={`mx-2.5 inline-flex h-11 w-11 shrink-0 -translate-y-[0.06em] cursor-pointer items-center justify-center rounded-full border align-middle transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/75 sm:h-12 sm:w-12 ${
                activeSeal === 0
                  ? "border-white/80 bg-[#1c1d25] text-[#f5f5f7] shadow-[0_0_0_4px_rgba(255,255,255,0.1)]"
                  : "border-white/30 bg-[#181920] text-[#d1d1d6]"
              }`}
            >
              <Lock className="size-4 sm:size-[18px]" strokeWidth={1.65} aria-hidden="true" />
            </button>

            <span>AES-256-GCM vault,</span>

            <button
              type="button"
              onMouseEnter={() => setActiveSeal(1)}
              onFocus={() => setActiveSeal(1)}
              onClick={() => setActiveSeal(1)}
              aria-pressed={activeSeal === 1}
              aria-label={SEALS[1].label}
              className={`mx-2.5 inline-flex h-11 w-11 shrink-0 -translate-y-[0.06em] cursor-pointer items-center justify-center rounded-full border border-[#f5f5f7] bg-[#f5f5f7] align-middle text-[#09090b] transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/75 sm:h-12 sm:w-12 ${
                activeSeal === 1 ? "shadow-[0_0_0_4px_rgba(255,255,255,0.18)]" : ""
              }`}
            >
              <EyeOff className="size-4 sm:size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </button>

            <span>ephemeral chats cleared on exit, and</span>

            <button
              type="button"
              onMouseEnter={() => setActiveSeal(2)}
              onFocus={() => setActiveSeal(2)}
              onClick={() => setActiveSeal(2)}
              aria-pressed={activeSeal === 2}
              aria-label={SEALS[2].label}
              className={`mx-2.5 inline-flex h-11 w-11 shrink-0 -translate-y-[0.06em] cursor-pointer items-center justify-center rounded-full border align-middle transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/75 sm:h-12 sm:w-12 ${
                activeSeal === 2
                  ? "border-white/75 bg-[#f5f5f7] text-[#09090b] shadow-[0_0_0_4px_rgba(255,255,255,0.14)]"
                  : "border-white/25 bg-[#232530] text-[#e4e4e9]"
              }`}
            >
              <ShieldCheck className="size-4 sm:size-[18px]" strokeWidth={1.65} aria-hidden="true" />
            </button>

            <span>scoped Nodes.</span>
          </h2>

          {/* Interactive 1-Line Specification Caption */}
          <p
            key={SEALS[activeSeal]!.id}
            className="lp-stage-panel mt-8 min-h-[24px] max-w-[56ch] text-[14.5px] leading-[1.55] text-[#a1a1a6]"
          >
            {SEALS[activeSeal]!.caption}
          </p>

          {/* Quiet Meta Strip */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13.5px] text-[#8e8e95]">
            <span>Zero passwords</span>
            <span aria-hidden="true">·</span>
            <span>Ephemeral AI</span>
            <span aria-hidden="true">·</span>
            <span>SSRF guarded</span>
            <span aria-hidden="true">·</span>
            <Link
              href="/security"
              className="group inline-flex min-h-[44px] items-center gap-1 font-medium text-[#f5f5f7] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75"
            >
              <span className="gal-link-underline">Security spec</span>
              <ArrowUpRight
                className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.7}
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>
      </section>

      <section
        id="waitlist"
        className="relative scroll-mt-24 overflow-hidden bg-[#0d0e12] pt-0 pb-24 sm:pb-32"
        aria-label="Open beta access"
      >
        {/* Grandiose 92-filament 24k Gold Neural Network Singularity Horizon */}
        <div className="h-[200px] w-full sm:h-[250px]" aria-hidden="true">
          <ClosingSingularityCanvas />
        </div>

        <div className="relative z-10 mx-auto flex max-w-[580px] flex-col items-center px-6 pt-4 text-center sm:px-10">
          <h2 className="font-editorial text-[clamp(2.35rem,4.6vw,3.65rem)] font-normal leading-[1.06] tracking-[-0.035em] text-[#f5f5f7] [text-wrap:balance]">
            Run your day from one environment
          </h2>
          <p className="mt-4 text-[15.5px] leading-[1.6] text-[#a1a1a6]">
            Free to start in open beta. No card required.
          </p>

          <div className="mt-8 w-full max-w-[460px]">
            <WaitlistForm theme="dark" />
          </div>

          <p className="mt-6 text-[13.5px] text-[#8e8e95]">
            Already invited?{" "}
            <Link
              href="/signup"
              className="font-medium text-[#f5f5f7] underline decoration-white/30 underline-offset-4 transition-colors hover:text-white hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/75"
            >
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
