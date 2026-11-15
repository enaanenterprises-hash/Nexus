import Link from "next/link";
import { GoldenNetwork } from "./GoldenNetwork";
import { LandingScenes } from "./LandingScenes";
import { NexusWordmark } from "./NexusLogo";
import { SiteFooter } from "./SiteFooter";

export function LandingPage() {
  return (
    <div className="landing flex min-h-[100svh] flex-1 flex-col">
      <main className="flex flex-col">
        <section className="relative flex h-[100svh] shrink-0 flex-col overflow-hidden" aria-label="Nexus">
          <div className="absolute inset-0">
            <GoldenNetwork />
          </div>
          <div className="landing-scrim pointer-events-none absolute inset-0" />

          <header className="landing-enter relative z-10 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8 lg:px-14">
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="Nexus home" className="inline-flex">
                <NexusWordmark className="h-[14px] w-auto sm:h-[17px]" />
              </Link>
              <span className="landing-beta">in beta</span>
            </div>
            <Link href="/waitlist" className="landing-signup">
              Join waitlist
            </Link>
          </header>

          <div className="relative z-10 flex flex-1 items-end px-6 pb-[14svh] sm:px-10 md:items-center md:pb-[8svh] lg:px-14">
            <h1 className="landing-line landing-enter landing-enter--late max-w-[18ch]">
              One intelligence, connecting everything you do.
            </h1>
          </div>
        </section>

        <LandingScenes />
      </main>
      <SiteFooter />
    </div>
  );
}
