"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, X } from "lucide-react";
import GlassSurface from "./GlassSurface";
import { GoldenNetwork } from "./GoldenNetwork";
import { NexusMark } from "./NexusLogo";

type PreviewTopicId = "command" | "sockets" | "privacy";

type PreviewTopic = {
  id: PreviewTopicId;
  prompt: string;
  answer: string;
  href: string;
  cta: string;
};

const PREVIEW_TOPICS: PreviewTopic[] = [
  {
    id: "command",
    prompt: "How Command works",
    answer:
      "Command brings Gmail, 30-day Google Calendar, Tasks, GitHub, Weather, Night Sky, Markets, and Formula 1 onto one 4×2 board. Click any tile to expand it into a full-screen workspace without leaving the room.",
    href: "#workspace",
    cta: "Explore interactive board",
  },
  {
    id: "sockets",
    prompt: "How sockets stay isolated",
    answer:
      "Every orbital workspace—Recording Studio, Research Reader, or custom SDK v1 nodes—declares an explicit capability manifest up front. Unrequested streams never cross the socket boundary.",
    href: "#roadmap",
    cta: "See platform roadmap",
  },
  {
    id: "privacy",
    prompt: "What stays private",
    answer:
      "Live conversations remain ephemeral in your browser session and clear when you leave. OAuth tokens and keys stay encrypted server-side with AES-256-GCM and are never returned to the browser.",
    href: "#security",
    cta: "Inspect security ledger",
  },
];

const NAV_LINKS = [
  { id: "workspace", href: "#workspace", label: "Workspace" },
  { id: "philosophy", href: "#philosophy", label: "Philosophy" },
  { id: "roadmap", href: "#roadmap", label: "Roadmap" },
  { id: "security", href: "#security", label: "Security" },
] as const;

export function HeroStage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<PreviewTopicId | null>(null);
  const [activeNavId, setActiveNavId] = useState<string | null>(null);
  const [darkHeader, setDarkHeader] = useState(false);

  const activeTopic = PREVIEW_TOPICS.find((t) => t.id === activeTopicId) ?? null;

  useEffect(() => {
    let raf = 0;
    const updateSurface = () => {
      raf = 0;
      const probeY = 44;
      let overDark = false;
      const transitionEl = document.getElementById("lightfall-transition");
      if (transitionEl) {
        const r = transitionEl.getBoundingClientRect();
        if (r.top + r.height * 0.38 <= probeY && r.bottom >= probeY) {
          overDark = true;
        }
      }
      if (!overDark) {
        const bands = document.querySelectorAll<HTMLElement>('[data-obsidian-band="true"]');
        for (const band of bands) {
          const r = band.getBoundingClientRect();
          if (r.top <= probeY && r.bottom >= probeY) {
            overDark = true;
            break;
          }
        }
      }
      setDarkHeader((prev) => (prev === overDark ? prev : overDark));
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(updateSurface);
    };

    updateSurface();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  useEffect(() => {
    const ids = NAV_LINKS.map((l) => l.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const visibleMap = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visibleMap.set(entry.target.id, entry.intersectionRatio);
          } else {
            visibleMap.delete(entry.target.id);
          }
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibleMap) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        setActiveNavId(bestId);
      },
      { threshold: [0.15, 0.35, 0.6], rootMargin: "-15% 0px -35% 0px" },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    setFeedback(null);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setFeedback(data.message || "You're on the waitlist. We'll reach out soon.");
        setEmail("");
      } else {
        setStatus("error");
        setFeedback(data.error || "Unable to join waitlist. Please check your email.");
      }
    } catch {
      setStatus("error");
      setFeedback("Network error. Please try again in a moment.");
    }
  }

  return (
    <>
      {/* Adaptive Floating Refractive Liquid Glass Navigation Capsule (<GlassSurface />) */}
      <header className="fixed inset-x-0 top-3.5 z-40 px-4 sm:top-5 sm:px-6">
        <GlassSurface
          width="100%"
          height={56}
          borderRadius={28}
          borderWidth={0.28}
          brightness={50}
          opacity={0.86}
          blur={7}
          displace={2.6}
          distortionScale={-195}
          redOffset={0}
          greenOffset={12}
          blueOffset={26}
          xChannel="R"
          yChannel="G"
          backgroundOpacity={darkHeader ? 0.2 : 0.24}
          saturation={1.4}
          className={`landing-glass-nav mx-auto max-w-[1080px] ${
            darkHeader ? "landing-glass-nav--dark" : "landing-glass-nav--light"
          }`}
        >
          <div className="flex h-full w-full items-center justify-between gap-3 pr-2 pl-3.5 sm:pr-2 sm:pl-4.5">
            <div className="flex items-center gap-2.5">
              <Link
                href="/"
                aria-label="Nexus home"
                className={`inline-flex items-center gap-2 rounded-full py-1 focus-visible:outline-2 focus-visible:outline-offset-4 ${
                  darkHeader ? "focus-visible:outline-[#f0b54a]" : "focus-visible:outline-[#9a6910]"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center transition-all duration-300 ${
                    darkHeader ? "landing-glass-mark--dark" : "landing-glass-mark--light"
                  }`}
                >
                  <NexusMark className="h-[20px] w-[20px] sm:h-[22px] sm:w-[22px]" />
                </span>
                <span
                  className={`text-[15.5px] font-semibold tracking-[-0.028em] transition-colors duration-300 ${
                    darkHeader
                      ? "landing-glass-text--dark text-[#ffffff]"
                      : "landing-glass-text--light text-[#09090b]"
                  }`}
                >
                  Nexus
                </span>
              </Link>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none transition-colors duration-300 ${
                  darkHeader
                    ? "border-[#f0b54a]/40 bg-black/30 text-[#ffe0a3]"
                    : "border-[#9a6910]/30 bg-white/50 text-[#744c07]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${darkHeader ? "bg-[#f0b54a]" : "bg-[#c88d18]"}`}
                  aria-hidden="true"
                />
                Beta
              </span>
            </div>

            <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map((item) => {
                const isActive = activeNavId === item.id;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    data-active={isActive ? "true" : "false"}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      darkHeader
                        ? isActive
                          ? "landing-glass-text--dark bg-white/[0.13] text-[#ffffff] ring-1 ring-inset ring-white/[0.18] focus-visible:outline-[#f0b54a]"
                          : "landing-glass-text--dark text-white/[0.84] hover:bg-white/[0.09] hover:text-white focus-visible:outline-[#f0b54a]"
                        : isActive
                          ? "landing-glass-text--light bg-[#0e0f12]/[0.08] text-[#09090b] ring-1 ring-inset ring-[#0e0f12]/[0.1] focus-visible:outline-[#9a6910]"
                          : "landing-glass-text--light text-[#16171d] hover:bg-[#0e0f12]/[0.055] hover:text-[#09090b] focus-visible:outline-[#9a6910]"
                    }`}
                  >
                    {isActive ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${darkHeader ? "bg-[#f0b54a]" : "bg-[#b47c10]"}`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                href="/signup"
                className={`hidden h-9 items-center justify-center rounded-full px-3.5 text-[13.5px] font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 sm:inline-flex ${
                  darkHeader
                    ? "landing-glass-text--dark text-white/[0.86] hover:bg-white/[0.1] hover:text-white focus-visible:outline-[#f0b54a]"
                    : "landing-glass-text--light text-[#16171d] hover:bg-[#0e0f12]/[0.06] hover:text-[#09090b] focus-visible:outline-[#9a6910]"
                }`}
              >
                Sign in
              </Link>
              <a
                href="#waitlist"
                className={`gal-btn-tactile group inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4.5 ${
                  darkHeader
                    ? "bg-[#f5f5f7] text-[#09090b] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,1)] hover:bg-white focus-visible:outline-[#f0b54a]"
                    : "bg-[#0e0f12] text-white shadow-[0_6px_18px_-6px_rgba(14,15,18,0.45),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-[#22242c] focus-visible:outline-[#9a6910]"
                }`}
              >
                <span>Join waitlist</span>
                <ArrowRight className="gal-arrow-shift h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </a>
            </div>
          </div>
        </GlassSurface>
      </header>

      {/* Full-Bleed Gallery Light Hero Stage with Living Burnished-Gold Neural Network */}
      <section
        id="hero-top"
        aria-label="Nexus"
        className="relative flex min-h-[min(100svh,940px)] flex-col items-center justify-center overflow-hidden bg-white px-6 pb-16 pt-28 sm:px-10 sm:pt-32"
      >
        <div className="pointer-events-none absolute inset-0">
          <GoldenNetwork theme="light" />
        </div>

        {/* Soft luminous optical reading halo behind centered headline so serif ink stays razor-sharp */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 46% 40% at 50% 47%, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0.36) 48%, rgba(255, 255, 255, 0) 76%)",
          }}
          aria-hidden="true"
        />

        {/* Bottom floor blend into pure white */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white via-white/80 to-transparent"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-[920px] flex-col items-center text-center">
          <h1 className="font-editorial text-[clamp(3.75rem,8.4vw,7.1rem)] font-normal leading-[0.98] tracking-[-0.045em] text-[#0e0f12]">
            <span className="gal-line-mask">
              <span className="gal-line-inner gal-line-inner--1">Welcome</span>
            </span>
          </h1>

          <p className="gal-enter gal-enter-delay-1 mt-6 max-w-[54ch] text-[16px] leading-[1.65] text-[#4a4c55] [text-wrap:pretty] sm:text-[18px]">
            Nexus is an architectural design built to connect your workflows into one continuous, unbroken flow, with
            modular components that let you curate your workspace to you.{" "}
            <span className="font-medium text-[#0e0f12]">Nexus is yours.</span>
          </p>

          {/* Interactive Apple Liquid Glass Hero Waitlist & Preview Pill */}
          <div className="gal-enter gal-enter-delay-2 mt-9 w-full max-w-[560px]">
            {status === "success" ? (
              <div
                className="apple-glass lp-stage-panel mx-auto flex items-center justify-center gap-3 rounded-full px-5 py-3.5 text-left"
                role="status"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#15803d] text-white">
                  <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </span>
                <p className="text-[14px] font-medium text-[#14532d]">{feedback}</p>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="apple-glass flex flex-col gap-2 rounded-[26px] p-2 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-[#9a6910]/30 sm:flex-row sm:items-center sm:rounded-full sm:p-1.5"
              >
                <label htmlFor="hero-waitlist-email" className="sr-only">
                  Email address for open beta
                </label>
                <input
                  id="hero-waitlist-email"
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === "loading"}
                  placeholder="Enter your email for open beta"
                  className="min-h-[44px] flex-1 bg-transparent px-4 text-[15px] text-[#0e0f12] placeholder:text-[#636570] focus:outline-none sm:pl-5"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="gal-btn-tactile inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[#0e0f12] px-5.5 text-[14.5px] font-medium text-white hover:bg-[#252730] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{status === "loading" ? "Joining…" : "Join waitlist"}</span>
                  <ArrowRight className="gal-arrow-shift h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </form>
            )}

            {status === "error" && feedback ? (
              <p className="mt-2.5 text-[13px] font-medium text-[#b91c1c]" role="alert">
                {feedback}
              </p>
            ) : null}

            {/* Interactive preview chips */}
            <div
              className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:flex-nowrap"
              role="group"
              aria-label="Quick architecture previews"
            >
              {PREVIEW_TOPICS.map((topic) => {
                const selected = activeTopicId === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setActiveTopicId((cur) => (cur === topic.id ? null : topic.id))}
                    className={`gal-btn-tactile min-h-[36px] shrink-0 cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910] ${
                      selected
                        ? "border-[#9a6910]/45 bg-[#c9932c]/12 font-medium text-[#0e0f12]"
                        : "border-[#0e0f12]/[0.11] bg-white/85 text-[#52545d] hover:border-[#0e0f12]/[0.24] hover:text-[#0e0f12]"
                    }`}
                  >
                    {topic.prompt}
                  </button>
                );
              })}
            </div>

            <div className="gal-accordion-grid" data-open={activeTopic ? "true" : "false"}>
              <div className="gal-accordion-inner">
                {activeTopic ? (
                  <div
                    className="apple-glass mt-3.5 rounded-[20px] p-4 text-left sm:p-5"
                    role="region"
                    aria-label={activeTopic.prompt}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] leading-[1.6] text-[#2c2e35]">{activeTopic.answer}</p>
                      <button
                        type="button"
                        onClick={() => setActiveTopicId(null)}
                        aria-label="Close preview"
                        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-[#636570] transition-colors hover:bg-[#0e0f12]/[0.06] hover:text-[#0e0f12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#0e0f12]/[0.07] pt-2.5 text-[13px]">
                      <span className="text-[#636570]">Nexus architecture preview</span>
                      <a
                        href={activeTopic.href}
                        className="group inline-flex items-center gap-1 font-medium text-[#9a6910] transition-colors hover:text-[#78500b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a6910]"
                      >
                        <span>{activeTopic.cta}</span>
                        <ArrowDown
                          className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-y-0.5"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
