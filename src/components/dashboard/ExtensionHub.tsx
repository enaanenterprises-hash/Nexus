"use client";

import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  PLANNED_EXTENSIONS,
  canActivateAnother,
  canUseSlot,
  type ExtensionHubSnapshot,
  type ExtensionId,
  type SlotId,
} from "@/lib/extensions";

type Props = {
  hub: ExtensionHubSnapshot;
  selected: SlotId | null;
  notice: string | null;
  onSnap: (id: ExtensionId) => void;
  onRelease: (id: ExtensionId) => void;
  onTogglePro: () => void;
};

const CONTRACT_URL = "https://github.com/enaanenterprises-hash/Nexus/blob/main/docs/extensions.md";

/** Catalog + plan: where extensions are snapped into (and out of) the network. */
export function ExtensionHub({ hub, selected, notice, onSnap, onRelease, onTogglePro }: Props) {
  const { entitlement, slots, extensions } = hub;
  const active = slots.filter((s) => s.occupiedBy);
  const available = extensions.filter((e) => !slots.some((s) => s.occupiedBy === e.manifest.id));
  const openSockets = slots.filter((s) => !s.occupiedBy && canUseSlot(s, entitlement)).length;
  const hasRoom = openSockets > 0 && canActivateAnother(active.length, entitlement);
  const selectedSlot = slots.find((s) => s.id === selected);

  return (
    <section aria-labelledby="hub-heading" className="flex flex-col gap-8">
      <header>
        <p className="dash-eyebrow">Extension hub</p>
        <h2 id="hub-heading" className="dash-heading mt-2">
          Network nodes
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-[color:var(--land-muted)]">
          Snap an extension in and it&apos;s wired to the core, sharing your context.
        </p>
      </header>

      <div className="rounded-2xl border border-[color:var(--land-hair)] bg-white/[0.025] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13.5px] font-medium">{entitlement.isPro ? "Nexus Pro · preview" : "Free plan"}</p>
            <p className="text-[12px] text-[color:var(--land-muted)]">
              {entitlement.isPro
                ? `${active.length} of ${slots.length} sockets in use`
                : `${active.length} of ${FREE_ACTIVE_EXTENSION_SLOTS} free sockets in use`}
            </p>
          </div>
          <button type="button" onClick={onTogglePro} className={`dash-button ${entitlement.isPro ? "" : "dash-button--gold"}`}>
            {entitlement.isPro ? "Back to Free" : "Preview Pro"}
          </button>
        </div>
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {slots.map((s) => (
            <span
              key={s.id}
              className={`h-1 flex-1 rounded-full ${
                s.occupiedBy ? "bg-[color:var(--land-gold)]" : canUseSlot(s, entitlement) ? "bg-white/25" : "bg-white/[0.07]"
              }`}
            />
          ))}
        </div>
        {selectedSlot ? (
          <p className="mt-3 text-[12px] leading-snug text-[color:var(--land-muted)]">{selectedSlot.description}.</p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-3 text-[12.5px] leading-snug text-[color:var(--land-gold-soft)]">
            {notice}
          </p>
        ) : null}
      </div>

      {active.length > 0 ? (
        <div>
          <p className="dash-eyebrow">Wired in</p>
          <ul className="mt-2">
            {active.map((slot) => {
              const ext = extensions.find((e) => e.manifest.id === slot.occupiedBy)!;
              return (
                <ExtensionRow
                  key={slot.id}
                  monogram={ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}
                  name={ext.manifest.name}
                  detail={`${slot.tier === "pro" ? "Pro" : "Free"} socket · ${ext.manifest.capabilities.join(", ")}`}
                  live
                  action={
                    <button type="button" className="dash-button" onClick={() => onRelease(ext.manifest.id)}>
                      Release
                    </button>
                  }
                />
              );
            })}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="dash-eyebrow">Available</p>
        <ul className="mt-2">
          {available.map((ext) => (
            <ExtensionRow
              key={ext.manifest.id}
              monogram={ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}
              name={ext.manifest.name}
              detail={ext.manifest.description}
              action={
                <button
                  type="button"
                  className={`dash-button ${hasRoom ? "dash-button--gold" : ""}`}
                  onClick={() => onSnap(ext.manifest.id)}
                  aria-label={`Snap ${ext.manifest.name} into the network`}
                >
                  {hasRoom ? "Snap in" : "Pro"}
                </button>
              }
            />
          ))}
        </ul>
        <p className="mt-2 text-[11.5px] text-[color:var(--land-faint)]">Sample extensions built on the public contract.</p>
      </div>

      <div>
        <p className="dash-eyebrow">Coming soon</p>
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {PLANNED_EXTENSIONS.map((p) => (
            <li key={p.key} className="rounded-xl border border-dashed border-white/10 px-3 py-2.5">
              <p className="text-[13.5px] font-medium text-[color:var(--land-muted)]">{p.name}</p>
              <p className="text-[11.5px] text-[color:var(--land-faint)]">{p.tagline}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="dash-eyebrow">Build a node</p>
        <pre className="dash-code mt-3 overflow-x-auto rounded-xl border border-[color:var(--land-hair)] bg-white/[0.02] p-3">
          <span className="text-[color:var(--land-gold-soft)]">const</span> node = defineExtension({"{"} manifest, handlers {"}"});{"\n"}
          <span className="text-[color:var(--land-gold-soft)]">await</span> extensionRegistry.register(node);{"\n"}
          <span className="text-[color:var(--land-gold-soft)]">await</span> extensionRegistry.activate(node.manifest.id);
        </pre>
        <a
          href={CONTRACT_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[12.5px] font-medium text-[color:var(--land-gold-soft)] hover:underline"
        >
          Read the extension contract
        </a>
      </div>
    </section>
  );
}

function ExtensionRow({
  monogram,
  name,
  detail,
  action,
  live = false,
}: {
  monogram: string;
  name: string;
  detail: string;
  action: React.ReactNode;
  live?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-[color:var(--land-hair)] py-3 last:border-b-0">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          live
            ? "border border-[color:var(--land-gold-soft)] bg-[rgba(240,181,74,0.14)] text-[#fff4dc]"
            : "border border-dashed border-[rgba(240,181,74,0.5)] text-[color:var(--land-gold)]"
        }`}
      >
        {monogram}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-tight">{name}</p>
        <p className="mt-0.5 truncate text-[12px] text-[color:var(--land-faint)]" title={detail}>
          {detail}
        </p>
      </div>
      {action}
    </li>
  );
}
