"use client";

import type { ReactNode } from "react";
import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  canUseSlot,
  placeholderName,
  type ExtensionHubSnapshot,
  type ExtensionId,
  type SlotId,
} from "@/lib/extensions";
import { LockIcon, NetworkIcon, NodesIcon, PlusIcon, ResearchIcon, TodayIcon } from "./icons";

export type PanelId = "today" | "nodes" | { extension: ExtensionId };

export type Surface = { view: "home" | "research"; panel: PanelId | null };

const isPanel = (panel: PanelId | null, id: PanelId) =>
  typeof id === "string" ? panel === id : typeof panel === "object" && panel?.extension === id.extension;

function MenuItem({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-current={active ? "page" : undefined} className={`node-menu-item ${active ? "node-menu-item--on" : ""}`}>
      <span className="node-menu-icon">{children}</span>
      <span className="node-menu-label">{label}</span>
    </button>
  );
}

/** Left menu: opens core nodes as full views and everything else as panels. */
export function NodeMenu({
  hub,
  surface,
  onHome,
  onResearch,
  onPanel,
}: {
  hub: ExtensionHubSnapshot;
  surface: Surface;
  onHome: () => void;
  onResearch: () => void;
  onPanel: (panel: PanelId) => void;
}) {
  const live = hub.slots.flatMap((slot) => {
    const ext = slot.occupiedBy ? hub.extensions.find((e) => e.manifest.id === slot.occupiedBy) : undefined;
    return ext ? [ext] : [];
  });
  const used = live.length;
  const cap = hub.entitlement.isPro ? hub.slots.length : FREE_ACTIVE_EXTENSION_SLOTS;

  return (
    <nav aria-label="Nexus nodes" className="node-menu">
      <MenuItem label="Network" active={surface.view === "home" && !surface.panel} onClick={onHome}>
        <NetworkIcon />
      </MenuItem>
      <MenuItem label="Research" active={surface.view === "research"} onClick={onResearch}>
        <ResearchIcon />
      </MenuItem>
      <MenuItem label="Today" active={isPanel(surface.panel, "today")} onClick={() => onPanel("today")}>
        <TodayIcon />
      </MenuItem>
      <MenuItem label="Nodes" active={isPanel(surface.panel, "nodes")} onClick={() => onPanel("nodes")}>
        <NodesIcon />
      </MenuItem>
      {live.length > 0 ? <span className="node-menu-divider" aria-hidden /> : null}
      {live.map((ext) => (
        <MenuItem
          key={ext.manifest.id}
          label={ext.manifest.name}
          active={isPanel(surface.panel, { extension: ext.manifest.id })}
          onClick={() => onPanel({ extension: ext.manifest.id })}
        >
          <span className="text-[11px] font-semibold">{ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}</span>
        </MenuItem>
      ))}
      <div className="flex-1" />
      <button type="button" onClick={() => onPanel("nodes")} className="node-menu-plan" title={`${used} of ${cap} sockets in use`}>
        <span className="flex gap-[3px]" aria-hidden>
          {Array.from({ length: cap }, (_, i) => (
            <span key={i} className={`h-1 w-1.5 rounded-full ${i < used ? "bg-[color:var(--land-gold)]" : "bg-white/20"}`} />
          ))}
        </span>
        <span>{hub.entitlement.isPro ? "Pro" : "Free"}</span>
      </button>
    </nav>
  );
}

/** Right rail: one-tap access to Research and every hub socket. */
export function NodeRail({
  hub,
  surface,
  onResearch,
  onSlot,
}: {
  hub: ExtensionHubSnapshot;
  surface: Surface;
  onResearch: () => void;
  onSlot: (slotId: SlotId) => void;
}) {
  return (
    <nav aria-label="Quick access" className="node-rail">
      <button
        type="button"
        onClick={onResearch}
        className={`node-rail-button node-rail-button--core ${surface.view === "research" ? "node-rail-button--on" : ""}`}
        title="Research"
        aria-label="Research"
      >
        <ResearchIcon size={17} />
      </button>
      <span className="node-menu-divider" aria-hidden />
      {hub.slots.map((slot) => {
        const ext = slot.occupiedBy ? hub.extensions.find((e) => e.manifest.id === slot.occupiedBy) : undefined;
        const open = canUseSlot(slot, hub.entitlement);
        const name = ext?.manifest.name ?? placeholderName(slot.placeholderKey);
        const state = ext ? "live" : open ? "open" : "locked";
        const selected = ext && isPanel(surface.panel, { extension: ext.manifest.id });
        return (
          <button
            key={slot.id}
            type="button"
            onClick={() => onSlot(slot.id)}
            className={`node-rail-button node-rail-button--${state} ${selected ? "node-rail-button--on" : ""}`}
            title={ext ? `${name} · live` : open ? `${slot.tier === "pro" ? "Pro" : "Free"} socket · open (${name})` : `Pro socket · ${name}`}
            aria-label={ext ? `${name}, wired in` : open ? `Open ${slot.tier} socket, reserved for ${name}` : `Locked Pro socket, reserved for ${name}`}
          >
            {ext ? (
              <span className="text-[11px] font-semibold">{ext.manifest.monogram ?? name.slice(0, 2)}</span>
            ) : open ? (
              <PlusIcon size={14} />
            ) : (
              <LockIcon size={13} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
