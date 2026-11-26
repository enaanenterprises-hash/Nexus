"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NexusMark } from "./NexusLogo";

const MONUMENTAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
  { href: "/waitlist", label: "Waitlist" },
  { href: "/contact", label: "Contact" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/signup", label: "Sign in" },
] as const;

function LaurelSprig({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg
      viewBox="0 0 28 46"
      className={`h-8 w-5 shrink-0 text-[#52545d] ${mirrored ? "gal-laurel-right -scale-x-100" : "gal-laurel-left"}`}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21 42C12.5 34.5 9.5 22 15.5 6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path d="M13 33c-4.5-.5-7.5-3.2-8.2-6.8 3.8-.2 7 2 8.2 6.8Z" fill="currentColor" fillOpacity="0.72" />
      <path d="M11.6 24.5c-4.2-1.2-6.8-4.4-6.8-8 3.8.4 6.4 3.2 6.8 8Z" fill="currentColor" fillOpacity="0.82" />
      <path d="M12.5 16c-3.6-1.8-5.6-5.2-5-8.5 3.4 1.1 5.4 4.2 5 8.5Z" fill="currentColor" fillOpacity="0.72" />
      <path d="M16.5 30c3.6-1.8 6.4-4.8 7-8.4-3.6.5-6.2 3.2-7 8.4Z" fill="currentColor" fillOpacity="0.52" />
      <path d="M15.2 21.5c3.5-2 5.8-5.2 6-8.6-3.4.8-5.6 3.6-6 8.6Z" fill="currentColor" fillOpacity="0.58" />
      <path d="M15.6 12.2c2.5-2.1 4-5.1 3.7-8.2-2.8 1.4-4.2 4.3-3.7 8.2Z" fill="currentColor" fillOpacity="0.78" />
    </svg>
  );
}

export function GalleryFooter() {
  const wordmarkRef = useRef<HTMLDivElement>(null);
  const [wordmarkVisible, setWordmarkVisible] = useState(false);

  useEffect(() => {
    const el = wordmarkRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setWordmarkVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <footer
      id="gallery-footer"
      aria-label="Site footer"
      className="border-t border-[#0e0f12]/[0.08] bg-white text-[#0e0f12]"
    >
      {/* Band 1: Pure Gallery White Centered Vertical Editorial Navigation */}
      <div className="mx-auto flex max-w-[1360px] flex-col items-center px-6 pt-20 pb-10 sm:px-10 sm:pt-28 sm:pb-14">
        <nav aria-label="Footer navigation" className="flex flex-col items-center gap-1.5 text-center sm:gap-2">
          {MONUMENTAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="gal-link-underline font-editorial px-4 py-1 text-[clamp(2rem,4.3vw,3.35rem)] font-normal leading-[1.15] tracking-[-0.032em] text-[#0e0f12] transition-colors duration-200 hover:text-[#52545d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0e0f12]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Band 2: Full-Width Edge-to-Edge Monumental Wordmark */}
      <div ref={wordmarkRef} className="mx-auto max-w-[1380px] px-4 pt-6 pb-8 sm:px-8 sm:pt-8 sm:pb-12">
        <div aria-hidden="true" className="w-full select-none overflow-hidden">
          <div className="gal-wordmark-rise" data-visible={wordmarkVisible ? "true" : "false"}>
            <svg
              viewBox="0 0 1200 345"
              className="block h-auto w-full"
              preserveAspectRatio="xMidYMid meet"
              role="presentation"
            >
              <text
                x="600"
                y="292"
                textAnchor="middle"
                fill="#0e0f12"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "388px",
                  fontWeight: 500,
                  letterSpacing: "-0.048em",
                }}
              >
                Nexus
              </text>
            </svg>
          </div>
        </div>
      </div>

      {/* Band 3: Ceremonial 3-Column Meta Row + Centered Legal & Live Status Bar */}
      <div className="mx-auto max-w-[1360px] px-6 sm:px-10">
        <div className="grid grid-cols-1 items-center gap-8 border-t border-[#0e0f12]/[0.09] py-9 md:grid-cols-3">
          <div className="flex items-center justify-center gap-3 md:justify-start">
            <Link
              href="/"
              aria-label="Nexus Atelier home"
              className="inline-flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0e0f12]"
            >
              <NexusMark className="h-8 w-8 shrink-0" />
              <span className="text-[16px] font-semibold tracking-[-0.025em] text-[#0e0f12]">Nexus Atelier</span>
            </Link>
          </div>

          <div className="gal-laurel-group flex items-center justify-center gap-3 text-center">
            <LaurelSprig />
            <p className="font-editorial text-[16px] font-medium leading-[1.25] tracking-[-0.015em] text-[#0e0f12] sm:text-[17px]">
              One room,
              <br />
              every workflow
            </p>
            <LaurelSprig mirrored />
          </div>

          <div className="text-center text-[13px] leading-[1.55] text-[#52545d] md:text-right">
            <p>Designed &amp; Engineered in Toronto</p>
            <p className="text-[#636570]">By Nexus Neural Labs</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 border-t border-[#0e0f12]/[0.07] py-6 text-[13px] text-[#636570]">
          {LEGAL_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="gal-link-underline transition-colors duration-150 hover:text-[#0e0f12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e0f12]"
            >
              {link.label}
            </Link>
          ))}
          <span className="inline-flex items-center gap-2 font-medium text-[#14532d]">
            <span className="h-2 w-2 rounded-full bg-[#15803d]" aria-hidden="true" />
            <span>Open Beta</span>
          </span>
          <span className="text-[#636570]">&copy; 2026 Nexus Neural Labs</span>
        </div>
      </div>
    </footer>
  );
}
