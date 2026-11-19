"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import GlassSurface from "./GlassSurface";
import { GoldenNetwork } from "./GoldenNetwork";
import { NexusMark } from "./NexusLogo";

const NAV_LINKS = [
  { id: "workspace", href: "#workspace", label: "Workspace" },
  { id: "integrations", href: "#integrations", label: "Integrations" },
  { id: "roadmap", href: "#roadmap", label: "Roadmap" },
  { id: "security", href: "#security", label: "Security" },
] as const;

export function HeroStage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeNavId, setActiveNavId] = useState<string | null>(null);
  const [darkHeader, setDarkHeader] = useState(false);

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
                  darkHeader ? "focus-visible:outline-white/75" : "focus-visible:outline-[#0e0f12]"
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
                    ? "border-white/[0.16] bg-white/[0.06] text-white/85"
                    : "border-[#0e0f12]/[0.14] bg-white/55 text-[#1c1e24]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${darkHeader ? "bg-[#22c55e]" : "bg-[#16a34a]"}`}
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
                          ? "landing-glass-text--dark bg-white/[0.13] text-[#ffffff] ring-1 ring-inset ring-white/[0.18] focus-visible:outline-white/75"
                          : "landing-glass-text--dark text-white/[0.84] hover:bg-white/[0.09] hover:text-white focus-visible:outline-white/75"
                        : isActive
                          ? "landing-glass-text--light bg-[#0e0f12]/[0.08] text-[#09090b] ring-1 ring-inset ring-[#0e0f12]/[0.1] focus-visible:outline-[#0e0f12]"
                          : "landing-glass-text--light text-[#16171d] hover:bg-[#0e0f12]/[0.055] hover:text-[#09090b] focus-visible:outline-[#0e0f12]"
                    }`}
                  >
                    {isActive ? (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${darkHeader ? "bg-white" : "bg-[#0e0f12]"}`}
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
                    ? "landing-glass-text--dark text-white/[0.86] hover:bg-white/[0.1] hover:text-white focus-visible:outline-white/75"
                    : "landing-glass-text--light text-[#16171d] hover:bg-[#0e0f12]/[0.06] hover:text-[#09090b] focus-visible:outline-[#0e0f12]"
                }`}
              >
                Sign in
              </Link>
              <a
                href="#waitlist"
                className={`gal-btn-tactile group inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4.5 ${
                  darkHeader
                    ? "bg-[#f5f5f7] text-[#09090b] shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,1)] hover:bg-white focus-visible:outline-white/75"
                    : "bg-[#0e0f12] text-white shadow-[0_6px_18px_-6px_rgba(14,15,18,0.45),inset_0_1px_0_rgba(255,255,255,0.16)] hover:bg-[#22242c] focus-visible:outline-[#0e0f12]"
                }`}
              >
                <span>Join waitlist</span>
                <ArrowRight className="gal-arrow-shift h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              </a>
            </div>
          </div>
        </GlassSurface>
      </header>

      {/* Full-Bleed Soft Cream-Gold Hero Stage with Living Burnished-Gold Neural Network */}
      <section
        id="hero-top"
        aria-label="Nexus"
        className="relative flex min-h-[min(100svh,920px)] flex-col items-center justify-center overflow-hidden bg-[#faf8f2] px-6 pb-16 pt-28 sm:px-10 sm:pt-32"
      >
        <div className="pointer-events-none absolute inset-0">
          <GoldenNetwork theme="light" />
        </div>

        {/* Soft luminous optical reading halo behind centered headline so serif ink stays razor-sharp */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 46% 40% at 50% 47%, rgba(250, 248, 242, 0.74) 0%, rgba(250, 248, 242, 0.38) 48%, rgba(250, 248, 242, 0) 76%)",
          }}
          aria-hidden="true"
        />

        {/* Bottom floor blend into subtle warm cream */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#faf8f2] via-[#faf8f2]/80 to-transparent"
          aria-hidden="true"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-[820px] flex-col items-center text-center">
          <h1 className="font-editorial text-[clamp(3.75rem,8.4vw,7.1rem)] font-normal leading-[0.98] tracking-[-0.045em] text-[#0e0f12]">
            <span className="gal-line-mask">
              <span className="gal-line-inner gal-line-inner--1">Welcome</span>
            </span>
          </h1>

          <p className="gal-enter gal-enter-delay-1 mt-5 max-w-[44ch] text-[16.5px] leading-[1.6] text-[#4a4c55] [text-wrap:pretty] sm:text-[18.5px]">
            Your personal assistant, daily dashboard, and everyday tools—connected in one calm workspace.
          </p>

          {/* Interactive Apple Liquid Glass Hero Waitlist Pill */}
          <div className="gal-enter gal-enter-delay-2 mt-8 w-full max-w-[520px]">
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
                className="apple-glass flex flex-col gap-2 rounded-[26px] p-2 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-[#0e0f12]/20 sm:flex-row sm:items-center sm:rounded-full sm:p-1.5"
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
                  className="gal-btn-tactile inline-flex min-h-[44px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[#0e0f12] px-5.5 text-[14.5px] font-medium text-white hover:bg-[#252730] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e0f12] disabled:cursor-not-allowed disabled:opacity-60"
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
          </div>
        </div>
      </section>
    </>
  );
}
