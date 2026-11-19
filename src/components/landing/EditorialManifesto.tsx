"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

const CREST_COUNT = 3;

export function EditorialManifesto() {
  const sectionRef = useRef<HTMLElement>(null);
  const [privacyActive, setPrivacyActive] = useState(false);
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
    const bandStart = index * 0.22;
    const bandEnd = bandStart + 0.34;
    const local = Math.max(0, Math.min(1, (scrollProgress - bandStart) / (bandEnd - bandStart)));
    return 0.32 + local * 0.68;
  };

  return (
    <section
      ref={sectionRef}
      aria-label="What Nexus does"
      className="relative z-10 bg-[#faf8f2] px-6 pt-20 pb-4 sm:px-10 sm:pt-24 sm:pb-5 lg:px-14 lg:pt-28 lg:pb-6"
    >
      <div className="mx-auto flex max-w-[920px] flex-col items-center text-center">
        <p className="font-editorial text-[clamp(2rem,4.7vw,4.05rem)] font-normal leading-[1.11] tracking-[-0.036em] text-[#0e0f12] [text-wrap:balance]">
          <span style={{ opacity: beatOpacity(0), transition: "opacity 180ms ease-out" }}>
            <span>Nexus</span>
            <a
              href="#workspace"
              aria-label="Jump to interactive Nexus workspace"
              className="gal-btn-tactile mx-[0.16em] inline-flex h-[0.9em] w-[0.9em] -translate-y-[0.06em] items-center justify-center rounded-full bg-[#0e0f12] align-middle text-white shadow-[0_6px_16px_-6px_rgba(14,15,18,0.45)] hover:bg-[#1e2028] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910]"
            >
              <ArrowRight className="gal-arrow-shift h-[0.46em] w-[0.46em]" strokeWidth={2.2} aria-hidden="true" />
            </a>
            <span>unifies your tools </span>
          </span>

          <span style={{ opacity: beatOpacity(1), transition: "opacity 180ms ease-out" }}>
            <span>into one calm room powered by</span>
            <button
              type="button"
              onClick={() => setLeadCrestIndex((i) => (i + 1) % CREST_COUNT)}
              aria-label="Cycle Nexus workspace emblems"
              className="group mx-[0.18em] inline-flex -translate-y-[0.06em] cursor-pointer items-center align-middle focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910]"
            >
              {/* Seal 1: Command Grid */}
              <span
                className={`relative flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-[#faf8f2] bg-[#14151a] text-[#f0c05a] shadow-[0_4px_12px_-4px_rgba(14,15,18,0.3)] transition-transform duration-200 ease-out group-hover:-translate-x-1 ${
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
                className={`relative -ml-[0.26em] flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-[#faf8f2] bg-[#9a6910] text-[#fffaf0] shadow-[0_4px_12px_-4px_rgba(154,105,16,0.38)] transition-transform duration-200 ease-out group-hover:scale-105 ${
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
                className={`relative -ml-[0.26em] flex h-[0.94em] w-[0.94em] items-center justify-center rounded-full border-[2px] border-[#faf8f2] bg-[#f3efe6] text-[#86590c] shadow-[0_4px_12px_-4px_rgba(14,15,18,0.18)] ring-1 ring-inset ring-[#9a6910]/25 transition-transform duration-200 ease-out group-hover:translate-x-1 ${
                  leadCrestIndex === 2 ? "z-30 scale-105" : "z-10"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-[0.48em] w-[0.48em]" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.75" />
                  <path d="m14.8 9.2-1.5 4.1-4.1 1.5 1.5-4.1 4.1-1.5Z" fill="currentColor" />
                </svg>
              </span>
            </button>
          </span>

          <span style={{ opacity: beatOpacity(2), transition: "opacity 180ms ease-out" }}>
            <span>your own connected feeds. It runs without ads, </span>
          </span>

          <span style={{ opacity: beatOpacity(3), transition: "opacity 180ms ease-out" }}>
            <span>clears live chats on exit, and keeps</span>
            <a
              href="#security"
              data-active={privacyActive ? "true" : "false"}
              onMouseEnter={() => setPrivacyActive(true)}
              onMouseLeave={() => setPrivacyActive(false)}
              onFocus={() => setPrivacyActive(true)}
              onBlur={() => setPrivacyActive(false)}
              aria-label="Inspect Nexus privacy guarantees"
              className="gal-fingerprint-trigger mx-[0.16em] inline-flex h-[0.94em] w-[0.94em] -translate-y-[0.06em] cursor-pointer items-center justify-center rounded-full bg-[#f5f2ea] align-middle text-[#9a6910] ring-1 ring-inset ring-[#9a6910]/20 transition-transform duration-200 hover:scale-105 hover:ring-[#9a6910]/45 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#9a6910]"
            >
              <svg viewBox="0 0 32 32" className="gal-fingerprint h-[0.66em] w-[0.66em]" fill="none" aria-hidden="true">
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
            </a>
            <span>your data private.</span>
          </span>
        </p>
      </div>
    </section>
  );
}
