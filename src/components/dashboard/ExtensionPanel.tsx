"use client";

import type { ExtensionHubSnapshot, ExtensionId } from "@/lib/extensions";
import { BoltIcon } from "./icons";

/** Panel view of one wired-in extension, with live Laniakea arm controls. */
export function ExtensionPanel({
  hub,
  id,
  onRelease,
  onTransfer,
}: {
  hub: ExtensionHubSnapshot;
  id: ExtensionId;
  onRelease: (id: ExtensionId) => void;
  onTransfer?: (fromId: ExtensionId, toId?: ExtensionId) => void;
}) {
  const ext = hub.extensions.find((e) => e.manifest.id === id);
  const slot = hub.slots.find((s) => s.occupiedBy === id);
  if (!ext) return <p className="text-[13.5px] text-[color:var(--land-muted)]">This extension is no longer registered.</p>;
  const { manifest } = ext;

  const otherLive = hub.slots
    .filter((s) => s.occupiedBy && s.occupiedBy !== id)
    .map((s) => ({
      slot: s,
      ext: hub.extensions.find((e) => e.manifest.id === s.occupiedBy),
    }))
    .filter((item): item is { slot: typeof item.slot; ext: NonNullable<typeof item.ext> } => Boolean(item.ext));

  return (
    <section aria-labelledby="ext-heading" className="flex flex-col gap-6">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[color:var(--land-gold-soft)] bg-[rgba(240,181,74,0.14)] text-[12px] font-semibold text-[#fff4dc]">
          {manifest.monogram ?? manifest.name.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="dash-eyebrow">{slot ? `${slot.tier === "pro" ? "Pro" : "Free"} arm · illuminated` : "Arm dark · disconnected"}</p>
          <h2 id="ext-heading" className="dash-heading mt-1 truncate">
            {manifest.name}
          </h2>
        </div>
      </header>
      <p className="text-[14px] leading-relaxed text-[color:var(--land-muted)]">{manifest.description}</p>

      {slot && onTransfer ? (
        <div className="rounded-2xl border border-[rgba(240,181,74,0.28)] bg-[rgba(240,181,74,0.06)] p-4">
          <p className="dash-eyebrow text-[color:var(--land-gold-soft)]">Laniakea Supercluster Routing</p>
          <p className="mt-1 text-[12.5px] leading-snug text-[color:var(--land-muted)]">
            Transmit a typed product from {manifest.name} across its golden filament arm into another wired node:
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {otherLive.length > 0 ? (
              otherLive.map((target) => (
                <button
                  key={target.ext.manifest.id}
                  type="button"
                  onClick={() => onTransfer(id, target.ext.manifest.id)}
                  className="dash-button dash-button--gold inline-flex items-center gap-1.5"
                >
                  <BoltIcon size={13} />
                  <span>Send → {target.ext.manifest.name}</span>
                </button>
              ))
            ) : (
              <button
                type="button"
                onClick={() => onTransfer(id)}
                className="dash-button dash-button--gold inline-flex items-center gap-1.5"
              >
                <BoltIcon size={13} />
                <span>Send → Great Attractor Core</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

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
          Disconnect node (darken arm)
        </button>
      ) : null}
    </section>
  );
}
