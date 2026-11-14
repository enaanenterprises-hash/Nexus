import Link from "next/link";
import { GoldenNetwork } from "./GoldenNetwork";
import { NexusLogo } from "./NexusLogo";

export function LandingPage() {
  return (
    <div className="landing relative flex min-h-[100svh] flex-1 flex-col overflow-hidden">
      <div className="absolute inset-0">
        <GoldenNetwork />
      </div>
      <div className="landing-scrim pointer-events-none absolute inset-0" />

      <header className="landing-enter relative z-10 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8 lg:px-14">
        <Link href="/" aria-label="Nexus home" className="inline-flex">
          <NexusLogo className="h-[13px] w-auto sm:h-[15px]" />
        </Link>
        <Link href="/signup" className="landing-signup">
          Sign up
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-end px-6 pb-[14svh] sm:px-10 md:items-center md:pb-[8svh] lg:px-14">
        <h1 className="landing-line landing-enter landing-enter--late max-w-[18ch]">
          One intelligence, connecting everything you do.
        </h1>
      </main>
    </div>
  );
}
