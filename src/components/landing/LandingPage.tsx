import Link from "next/link";
import { ChromeWordmark } from "./ChromeWordmark";
import { DashboardPreview } from "./DashboardPreview";
import { FeatureCallouts } from "./FeatureCallouts";
import { GoldNeuralField } from "./GoldNeuralField";
import { LandingNav } from "./LandingNav";

export function LandingPage() {
  return (
    <div className="landing-root flex min-h-full flex-col">
      <div className="relative flex min-h-[100svh] flex-col overflow-hidden">
        <GoldNeuralField />
        <LandingNav />

        <main
          id="top"
          className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 pb-10 pt-10 sm:px-8 sm:pt-14 lg:px-10 lg:pt-16"
        >
          <div className="grid flex-1 items-start gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-8">
            <div className="relative z-10 max-w-xl pt-2 lg:pt-6">
              <p className="landing-tag mb-5 inline-flex items-center gap-2">
                <span className="text-[color:var(--land-gold)]" aria-hidden>
                  ◆
                </span>
                Modular · Powerful · Yours
              </p>

              <ChromeWordmark size="hero" className="mb-5 block" />

              <h1 className="font-[family-name:var(--font-display)] text-[2.35rem] leading-[1.05] tracking-[-0.03em] text-[color:var(--land-ink)] sm:text-5xl lg:text-[3.35rem]">
                The AI network that adapts to{" "}
                <span className="text-[color:var(--land-gold-soft)]">you.</span>
              </h1>

              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[color:var(--land-muted)] sm:text-base">
                Nexus is a personal AI operating environment — one living brain
                with modular extensions that share context instead of silos.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/dashboard" className="landing-cta-solid">
                  Get Started
                  <span aria-hidden className="ml-1.5">
                    →
                  </span>
                </Link>
                <a href="#extensions" className="landing-cta-ghost">
                  Explore Extensions
                </a>
              </div>

              <p className="mt-8 flex items-center gap-3 text-xs text-[color:var(--land-faint)] sm:text-[13px]">
                <span className="flex -space-x-2" aria-hidden>
                  {["N", "E", "X", "S"].map((letter) => (
                    <span
                      key={letter}
                      className="inline-flex h-7 w-7 items-center justify-center border border-[color:var(--land-line)] bg-black/70 font-[family-name:var(--font-mono)] text-[9px] tracking-wider text-[color:var(--land-gold-soft)]"
                    >
                      {letter}
                    </span>
                  ))}
                </span>
                Early operators consolidating life into one network.
              </p>
            </div>

            {/* Right column reserves space so the gold neural field reads as the hero visual */}
            <div className="relative hidden min-h-[20rem] lg:block" aria-hidden />
          </div>

          <div className="relative z-20 mt-6 sm:mt-4 lg:-mt-2">
            <DashboardPreview />
          </div>
        </main>
      </div>

      <section className="relative z-10 border-t border-[color:var(--land-line)] bg-black pb-6 pt-14 sm:pt-16">
        <FeatureCallouts />

        <footer
          id="docs"
          className="mx-auto mt-16 max-w-6xl border-t border-[color:var(--land-line)] px-5 py-10 text-center sm:px-8 lg:px-10"
        >
          <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.32em] text-[color:var(--land-faint)] uppercase">
            + A modular AI ecosystem
          </p>
          <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-[color:var(--land-muted)]">
            Extension authors: see the in-repo contract at{" "}
            <span className="text-[color:var(--land-gold-soft)]">
              docs/extensions.md
            </span>
            . Core dashboard lives at{" "}
            <Link
              href="/dashboard"
              className="text-[color:var(--land-ink)] underline decoration-[color:var(--land-line)] underline-offset-4 transition-colors hover:decoration-[color:var(--land-gold)]"
            >
              /dashboard
            </Link>
            .
          </p>
        </footer>
      </section>
    </div>
  );
}
