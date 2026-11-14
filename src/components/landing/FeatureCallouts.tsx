const EXTENSIONS = [
  {
    name: "Nexus Studio",
    blurb: "Create, edit, and innovate.",
    status: "Slot reserved",
  },
  {
    name: "Nexus Study",
    blurb: "Learn smarter, faster.",
    status: "Slot reserved",
  },
  {
    name: "Nexus Dev",
    blurb: "Build with AI beside you.",
    status: "Slot reserved",
  },
] as const;

export function FeatureCallouts() {
  return (
    <div
      id="extensions"
      className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:px-10"
    >
      <div id="about" className="max-w-md">
        <p className="mb-3 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] text-[color:var(--land-gold)] uppercase">
          ◆ Your AI assistant
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-tight text-[color:var(--land-ink)] sm:text-3xl">
          One brain. A network of nodes.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--land-muted)] sm:text-[15px]">
          Get help, generate, research, and organize — routed through a central
          Nexus that stays with you as extensions snap in.
        </p>
      </div>

      <div>
        <p className="mb-4 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.28em] text-[color:var(--land-muted)] uppercase">
          Powerful extensions
        </p>
        <ul className="space-y-2">
          {EXTENSIONS.map((ext) => (
            <li
              key={ext.name}
              className="landing-glass flex items-center justify-between gap-4 px-4 py-3"
            >
              <div>
                <p className="text-sm text-[color:var(--land-ink)]">
                  {ext.name}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--land-muted)]">
                  {ext.blurb}
                </p>
              </div>
              <span className="shrink-0 font-[family-name:var(--font-mono)] text-[9px] tracking-[0.16em] text-[color:var(--land-faint)] uppercase">
                {ext.status}
              </span>
            </li>
          ))}
        </ul>
        <p
          id="pricing"
          className="mt-4 text-xs leading-relaxed text-[color:var(--land-faint)]"
        >
          Free plan includes the core assistant and two active extension slots.
          Nexus Pro unlocks the rest — billing soon.
        </p>
      </div>
    </div>
  );
}
