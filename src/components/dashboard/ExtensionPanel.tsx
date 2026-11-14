"use client";

import type { ExtensionHubSnapshot, ExtensionId } from "@/lib/extensions";

/** Panel view of one wired-in extension. Extensions do not ship their own UI yet. */
export function ExtensionPanel({
  hub,
  id,
  onRelease,
}: {
  hub: ExtensionHubSnapshot;
  id: ExtensionId;
  onRelease: (id: ExtensionId) => void;
}) {
  const ext = hub.extensions.find((e) => e.manifest.id === id);
  const slot = hub.slots.find((s) => s.occupiedBy === id);
  if (!ext) return <p className="text-[13.5px] text-[color:var(--land-muted)]">This extension is no longer registered.</p>;
  const { manifest } = ext;

  return (
    <section aria-labelledby="ext-heading" className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[color:var(--land-gold-soft)] bg-[rgba(240,181,74,0.14)] text-[12px] font-semibold text-[#fff4dc]">
          {manifest.monogram ?? manifest.name.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="dash-eyebrow">{slot ? `${slot.tier === "pro" ? "Pro" : "Free"} socket · live` : "Not wired in"}</p>
          <h2 id="ext-heading" className="dash-heading mt-1 truncate">
            {manifest.name}
          </h2>
        </div>
      </header>
      <p className="text-[14px] leading-relaxed text-[color:var(--land-muted)]">{manifest.description}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-[color:var(--land-faint)]">Version</dt>
        <dd>{manifest.version}</dd>
        <dt className="text-[color:var(--land-faint)]">Author</dt>
        <dd>{manifest.author ?? "Unknown"}</dd>
        <dt className="text-[color:var(--land-faint)]">Capabilities</dt>
        <dd className="flex flex-wrap gap-1.5">
          {manifest.capabilities.map((c) => (
            <span key={c} className="research-tag">
              {c}
            </span>
          ))}
        </dd>
        <dt className="text-[color:var(--land-faint)]">Id</dt>
        <dd className="truncate dash-code">{manifest.id}</dd>
      </dl>
      {slot ? (
        <button type="button" className="dash-button self-start" onClick={() => onRelease(id)}>
          Release from socket
        </button>
      ) : null}
    </section>
  );
}
