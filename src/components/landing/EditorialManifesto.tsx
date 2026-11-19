"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

type MedallionId = "workspace" | "feeds" | "privacy";

const FEED_CRESTS = [
  { id: "command", label: "Command — Gmail, Calendar, Tasks, and live telemetry." },
  { id: "studio", label: "Studio — Multi-track recording with cloud sync." },
  { id: "research", label: "Research — Tracker-free web reading and highlights." },
] as const;

export function EditorialManifesto() {
  const sectionRef = useRef<HTMLElement>(null);
  const [selectedMedallion, setSelectedMedallion] = useState<MedallionId | null>(null);
  const [leadCrestIndex, setLeadCrestIndex] = useState<number>(0);
  const [scrollProgress, setScrollProgress] = useState<number>(1);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 900;
      const start = vh * 0.92;
      const end = vh * 0.24;
      const raw = (start - rect.top) / (start - end);
      setScrollProgress(Math.max(0, Math.min(1, raw)));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const beatOpacity = (index: number) => {
    const bandStart = index * 0.24;
    const bandEnd = bandStart + 0.36;
    const local = Math.max(0, Math.min(1, (scrollProgress - bandStart) / (bandEnd - bandStart)));
    return 0.32 + local * 0.68;
  };

  const activeFeedCrest = FEED_CRESTS[leadCrestIndex]!;

  const caption =
    selectedMedallion === "workspace"
      ? "Neural Network, Command, and Nodes in one workspace."
      : selectedMedallion === "feeds"
        ? activeFeedCrest.label
        : selectedMedallion === "privacy"
          ? "AES-256-GCM vault, scoped sockets, and ephemeral sessions."
          : null;

  const captionHref =
    selectedMedallion === "privacy" ? "#security" : selectedMedallion ? "#workspace" : null;
  const captionCta =
    selectedMedallion === "privacy" ? "Security" : selectedMedallion ? "Explore" : null;

  return (
    <section
      ref={sectionRef}
      aria-label="What Nexus does"
      className="relative z-10 bg-[#faf8f2] px-6 pt-20 pb-2 sm:px-10 sm:pt-24 sm:pb-3 lg:px-14 lg:pt-28 lg:pb-4"
    >
      <div className="mx-auto flex max-w-[860px] flex-col items-center text-center">
        <p className="font-editorial text-[clamp(2rem,4.7vw,3.95rem)] font-normal leading-[1.12] tracking-[-0.036em] text-[#0e0f12] [text-wrap:balance]">
          <span style={{ opacity: beatOpacity(0), transition: "opacity 180ms ease-out" }}>
            <span>Nexus</span>
            <a
              href="#workspace"
              onMouseEnter={() => setSelectedMedallion("workspace")}
              onFocus={() => setSelectedMedallion("workspace")}
              aria-label="Jump to interactive Nexus workspace"
              className="gal-btn-tactile mx-[0.16em] inline-flex h-[0.9em] w-[0.9em] -translate-y-[0.06em] items-center justify-center rounded-full bg-[#0e0f12] align-middle text-white shadow-[0_6px_16px_-6px_rgba(14,15,18,0.45)] hover:bg-[#23252d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0e0f12]"
            >
              <ArrowRight className="gal-arrow-shift h-[0.46em] w-[0.46em]" strokeWidth={2.2} aria-hidden="true" />
            </a>
            <span>unifies your tools </span>
          </span>

          <span style={{ opacity: beatOpacity(1), transition: "opacity 180ms ease-out" }}>
            <button
              type="button"
              onClick={() => {
                setSelectedMedallion("feeds");
                setLeadCrestIndex((i) => (i + 1) % FEED_CRESTS.length);
              }}
              onMouseEnter={() => setSelectedMedallion("feeds")}
              aria-label="Cycle Nexus workspace emblems"
              className="group mx-[0.16em] inline-flex -translate-y-[0.06em] cursor-pointer items-center align-middle focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0e0f12]"
            >
              <span
                className={`relative flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-[#faf8f2] bg-[#14151a] text-white shadow-[0_4px_12px_-4px_rgba(14,15,18,0.28)] transition-transform duration-200 ease-out group-hover:-translate-x-1 ${
                  leadCrestIndex === 0 ? "z-30 scale-105" : "z-10"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-[0.46em] w-[0.46em]" fill="none" aria-hidden="true">
                  <rect x="3.5" y="4.5" width="7" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                  <rect x="13.5" y="4.5" width="7" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                  <rect x="3.5" y="13.5" width="17" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
                </svg>
              </span>

              <span
                className={`relative -ml-[0.26em] flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-[#faf8f2] bg-[#2c2e36] text-white shadow-[0_4px_12px_-4px_rgba(14,15,18,0.24)] transition-transform duration-200 ease-out group-hover:scale-105 ${
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

              <span
                className={`relative -ml-[0.26em] flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-[#faf8f2] bg-[#efece4] text-[#1c1e24] shadow-[0_4px_12px_-4px_rgba(14,15,18,0.16)] ring-1 ring-inset ring-[#0e0f12]/12 transition-transform duration-200 ease-out group-hover:translate-x-1 ${
                  leadCrestIndex === 2 ? "z-30 scale-105" : "z-10"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-[0.48em] w-[0.48em]" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.75" />
                  <path d="m14.8 9.2-1.5 4.1-4.1 1.5 1.5-4.1 4.1-1.5Z" fill="currentColor" />
                </svg>
              </span>
            </button>
            <span>into one calm room—</span>
          </span>

          <span style={{ opacity: beatOpacity(2), transition: "opacity 180ms ease-out" }}>
            <span>ad-free, ephemeral, and</span>
            <button
              type="button"
              data-active={selectedMedallion === "privacy" ? "true" : "false"}
              onClick={() => setSelectedMedallion((cur) => (cur === "privacy" ? null : "privacy"))}
              onMouseEnter={() => setSelectedMedallion("privacy")}
              aria-label="Inspect Nexus privacy guarantees"
              className="gal-fingerprint-trigger mx-[0.16em] inline-flex h-[0.94em] w-[0.94em] -translate-y-[0.06em] cursor-pointer items-center justify-center rounded-full bg-[#f2f3f6] align-middle text-[#1c1e24] ring-1 ring-inset ring-[#0e0f12]/12 transition-transform duration-200 hover:scale-105 hover:ring-[#0e0f12]/30 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0e0f12]"
            >
              <svg viewBox="0 0 32 32" className="gal-fingerprint h-[0.66em] w-[0.66em]" fill="none" aria-hidden="true">
                <path d="M16 6.5c-4.95 0-9 4.05-9 9 0 2.55.55 4.85 1.45 6.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 6.5c4.95 0 9 4.05 9 9 0 2.2-.4 4.2-1.15 5.95" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 9.8c-3.15 0-5.7 2.55-5.7 5.7 0 3.05.9 5.9 2.45 8.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 9.8c3.15 0 5.7 2.55 5.7 5.7 0 2.65-.65 5.15-1.85 7.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 13.1c-1.35 0-2.4 1.05-2.4 2.4 0 3.1.95 6.1 2.75 8.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M18.4 15.5c0 2.4-.55 4.85-1.55 7.05" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 15.5c0 2.1.45 4.25 1.35 6.15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <span>private.</span>
          </span>
        </p>

        {/* Quiet caption only appears on emblem inspection */}
        <div
          key={`${selectedMedallion ?? "idle"}-${leadCrestIndex}`}
          className="lp-stage-panel mt-4 flex min-h-[24px] flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13.5px] leading-[1.5] text-[#636570]"
          aria-live="polite"
        >
          {caption ? (
            <>
              <span>{caption}</span>
              {captionHref && captionCta ? (
                <a
                  href={captionHref}
                  className="gal-link-underline font-medium text-[#0e0f12] transition-colors hover:text-[#4a4c55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e0f12]"
                >
                  {captionCta}
                </a>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
