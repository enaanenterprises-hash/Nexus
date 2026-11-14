import Link from "next/link";
import { ChromeWordmark } from "./ChromeWordmark";

/** Glass product preview — visual only; CTAs route into /dashboard. */
export function DashboardPreview() {
  return (
    <Link
      href="/dashboard"
      className="landing-glass group relative block overflow-hidden outline-none transition-[border-color,transform] duration-300 hover:border-[color:var(--land-gold-dim)] focus-visible:border-[color:var(--land-gold)]"
      aria-label="Open the Nexus dashboard"
    >
      <div className="flex min-h-[15.5rem] sm:min-h-[16.5rem]">
        {/* Sidebar echo */}
        <aside className="hidden w-[7.5rem] shrink-0 flex-col border-r border-[color:var(--land-line)] bg-black/35 px-3 py-4 md:flex">
          <ChromeWordmark size="footer" className="mb-6 opacity-90" />
          <ul className="space-y-1 text-[11px] tracking-wide text-[color:var(--land-muted)]">
            <li className="bg-white/[0.06] px-2 py-1.5 text-[color:var(--land-ink)]">
              Home
            </li>
            <li className="px-2 py-1.5">Extensions</li>
            <li className="px-2 py-1.5">Library</li>
            <li className="px-2 py-1.5">Settings</li>
          </ul>
        </aside>

        <div className="relative flex flex-1 flex-col justify-between px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-[family-name:var(--font-display)] text-xl text-[color:var(--land-ink)] sm:text-2xl">
                Good evening.
              </p>
              <p className="mt-1 text-sm text-[color:var(--land-muted)]">
                How can I help you today?
              </p>
            </div>
            <div className="flex items-center gap-2 text-[color:var(--land-muted)]">
              <span className="hidden h-7 w-7 items-center justify-center border border-[color:var(--land-line)] text-[10px] sm:inline-flex">
                ⌂
              </span>
              <span className="inline-flex h-7 w-7 items-center justify-center border border-[color:var(--land-line)] font-[family-name:var(--font-mono)] text-[10px] tracking-wider text-[color:var(--land-gold)]">
                N
              </span>
            </div>
          </div>

          <div className="mt-10 flex items-center gap-3 border border-[color:var(--land-line)] bg-black/45 px-3 py-2.5">
            <span
              className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] text-[color:var(--land-gold)] uppercase"
              aria-hidden
            >
              ◆
            </span>
            <span className="flex-1 text-sm text-[color:var(--land-faint)]">
              Ask Nexus anything…
            </span>
            <span className="inline-flex h-8 w-8 items-center justify-center bg-[color:var(--land-ink)] text-xs text-black transition-colors group-hover:bg-[color:var(--land-gold)]">
              →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
