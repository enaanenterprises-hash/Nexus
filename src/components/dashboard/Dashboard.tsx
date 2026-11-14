"use client";

import { ExtensionHub } from "./ExtensionHub";
import { NetworkCanvas } from "./NetworkCanvas";
import { NexusInteraction, NexusOrb } from "./NexusCore";
import { TaskPanel } from "./TaskPanel";

export function Dashboard() {
  return (
    <div className="flex min-h-full flex-col">
      <header className="nexus-field relative flex min-h-[100svh] flex-col">
        <NetworkCanvas />

        <nav className="flex items-center justify-between px-5 py-5 sm:px-8">
          <a
            href="/"
            className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] text-[color:var(--ink-soft)] uppercase transition-colors hover:text-[color:var(--ink)]"
          >
            Nexus
          </a>
          <div className="flex items-center gap-6">
            <a
              href="#top"
              className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] text-[color:var(--ink-faint)] uppercase transition-colors hover:text-[color:var(--ink)]"
            >
              Network
            </a>
            <a
              href="#organize"
              className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.28em] text-[color:var(--ink-faint)] uppercase transition-colors hover:text-[color:var(--ink)]"
            >
              Organize
            </a>
          </div>
        </nav>

        <div
          id="top"
          className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pb-16 pt-4 sm:px-8 sm:pt-8"
        >
          <p className="mb-3 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.35em] text-[color:var(--accent)] uppercase">
            Personal AI operating environment
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-[-0.03em] text-[color:var(--ink)] sm:text-7xl md:text-8xl">
            Nexus
          </h1>
          <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-[color:var(--ink-soft)] sm:text-base">
            One living network. Extensions snap into the rim — the brain stays
            at the center.
          </p>

          <div className="mt-10 w-full sm:mt-14">
            <ExtensionHub>
              <NexusOrb />
            </ExtensionHub>
          </div>

          <div className="mt-10 w-full sm:mt-12">
            <NexusInteraction />
          </div>
        </div>
      </header>

      <TaskPanel />

      <footer className="border-t border-[color:var(--line)] px-5 py-8 text-center sm:px-8">
        <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.2em] text-[color:var(--ink-faint)] uppercase">
          Step 1 · Dashboard + extension socket · Studio / Study / Call /
          Calendar not built yet
        </p>
      </footer>
    </div>
  );
}
