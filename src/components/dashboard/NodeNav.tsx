"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { signOutAction } from "@/lib/auth/actions";
import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  canUseSlot,
  placeholderName,
  setStubPro,
  type ExtensionHubSnapshot,
  type ExtensionId,
  type SlotId,
} from "@/lib/extensions";
import { useTheme } from "@/lib/theme";
import { CommandIcon, LockIcon, MoonIcon, NetworkIcon, NodesIcon, PlusIcon, SignOutIcon, SunIcon, TodayIcon } from "./icons";

export type PanelId = "today" | "nodes" | { extension: ExtensionId };

export type Surface = { view: "home" | "research" | "command"; panel: PanelId | null };

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

/** Left menu: docked on full-screen views; extends from the top-left button on the network stage. */
export function NodeMenu({
  id,
  hub,
  surface,
  floating = false,
  open = true,
  navRef,
  onHome,
  onCommand,
  onPanel,
}: {
  id?: string;
  hub: ExtensionHubSnapshot;
  surface: Surface;
  floating?: boolean;
  open?: boolean;
  navRef?: RefObject<HTMLElement | null>;
  onHome: () => void;
  onCommand: () => void;
  onPanel: (panel: PanelId) => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const [tierMenuOpen, setTierMenuOpen] = useState(false);
  const tierMenuRef = useRef<HTMLDivElement>(null);

  const showTierMenu = tierMenuOpen && (!floating || open);

  const live = hub.slots.flatMap((slot) => {
    const ext = slot.occupiedBy ? hub.extensions.find((e) => e.manifest.id === slot.occupiedBy) : undefined;
    return ext ? [ext] : [];
  });
  const used = live.length;
  const cap = hub.entitlement.isPro ? hub.slots.length : FREE_ACTIVE_EXTENSION_SLOTS;

  useEffect(() => {
    if (!showTierMenu) return;
    function onPointerDown(event: MouseEvent) {
      if (tierMenuRef.current && !tierMenuRef.current.contains(event.target as Node)) {
        setTierMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setTierMenuOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showTierMenu]);

  const floatingClass = floating
    ? `node-menu--floating ${open ? "node-menu--open" : "node-menu--collapsed"}`
    : "";

  return (
    <nav
      ref={navRef}
      id={id}
      aria-label="Nexus nodes"
      aria-hidden={floating && !open ? true : undefined}
      className={`node-menu ${floatingClass}`}
    >
      <MenuItem label="Network" active={surface.view === "home" && !surface.panel} onClick={onHome}>
        <NetworkIcon />
      </MenuItem>
      <MenuItem label="Command" active={surface.view === "command"} onClick={onCommand}>
        <CommandIcon />
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
      {floating ? <span className="node-menu-divider" aria-hidden /> : <div className="flex-1" />}
      <MenuItem label={theme === "dark" ? "Light" : "Dark"} active={false} onClick={toggleTheme}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </MenuItem>
      <div ref={tierMenuRef} className="relative flex w-full justify-center">
        <button
          type="button"
          onClick={() => setTierMenuOpen((v) => !v)}
          aria-expanded={showTierMenu}
          aria-haspopup="menu"
          className={`node-menu-plan ${showTierMenu ? "node-menu-plan--on" : ""}`}
          title={`${used} of ${cap} sockets in use`}
        >
          <span className="flex gap-[3px]" aria-hidden>
            {Array.from({ length: cap }, (_, i) => (
              <span key={i} className={`h-1 w-1.5 rounded-full ${i < used ? "bg-[color:var(--land-gold)]" : "bg-[color:var(--land-line)]"}`} />
            ))}
          </span>
          <span>{hub.entitlement.isPro ? "Pro" : "Free"}</span>
        </button>

        {showTierMenu ? (
          <div role="menu" aria-label="Free tier menu" className="node-tier-menu">
            <div className="px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-[#f5f5f7]">
                  {hub.entitlement.isPro ? "Nexus Pro · preview" : "Free tier"}
                </p>
                <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#a1a1a6]">
                  {used}/{cap}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-[#a1a1a6]">
                {hub.entitlement.isPro
                  ? `${used} of ${hub.slots.length} sockets in use`
                  : `${used} of ${FREE_ACTIVE_EXTENSION_SLOTS} free sockets in use`}
              </p>
              <div className="mt-2.5 flex gap-1" aria-hidden>
                {hub.slots.map((s) => (
                  <span
                    key={s.id}
                    className={`h-1 flex-1 rounded-full ${
                      s.occupiedBy
                        ? "bg-[#f0b54a]"
                        : canUseSlot(s, hub.entitlement)
                          ? "bg-white/20"
                          : "bg-white/10"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="my-1 h-px bg-white/10" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setTierMenuOpen(false);
                onPanel("nodes");
              }}
              className="node-tier-menu-item"
            >
              <NodesIcon size={15} />
              <span>Manage nodes</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => setStubPro(!hub.entitlement.isPro)}
              className="node-tier-menu-item"
            >
              <span className="grid h-[15px] w-[15px] place-items-center text-[10px] font-bold text-[#f0b54a]">
                ✦
              </span>
              <span>{hub.entitlement.isPro ? "Back to Free tier" : "Preview Pro"}</span>
            </button>

            <div className="my-1 h-px bg-white/10" />

            <form action={signOutAction} className="w-full">
              <button type="submit" role="menuitem" className="node-tier-menu-item node-tier-menu-item--signout">
                <SignOutIcon size={15} />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

/** Right rail: minimizes into a slim bar at the right edge and slides out on mouse hover. */
export function NodeRail({
  hub,
  surface,
  onCommand,
  onSlot,
}: {
  hub: ExtensionHubSnapshot;
  surface: Surface;
  onCommand: () => void;
  onSlot: (slotId: SlotId) => void;
}) {
  const [open, setOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);

  function openRail() {
    window.clearTimeout(closeTimerRef.current);
    setOpen(true);
  }

  function scheduleClose() {
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div
      ref={dockRef}
      className={`node-rail-dock ${open ? "node-rail-dock--open" : ""}`}
      onMouseEnter={openRail}
      onMouseLeave={scheduleClose}
      onFocusCapture={openRail}
      onBlurCapture={(event) => {
        if (!dockRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        onMouseEnter={openRail}
        onClick={() => (open ? setOpen(false) : openRail())}
        aria-label="Show node quick rail"
        aria-expanded={open}
        className="node-rail-bar"
      >
        <span className="node-rail-pill" aria-hidden>
          <span className="node-rail-pip node-rail-pip--core" />
          {hub.slots.map((slot) => {
            const state = slot.occupiedBy ? "live" : canUseSlot(slot, hub.entitlement) ? "open" : "locked";
            return <span key={slot.id} className={`node-rail-pip node-rail-pip--${state}`} />;
          })}
        </span>
      </button>

      <nav aria-label="Quick access" aria-hidden={!open} className="node-rail node-rail--sliding">
        <button
          type="button"
          onClick={onCommand}
          tabIndex={open ? 0 : -1}
          className={`node-rail-button node-rail-button--core ${surface.view === "command" ? "node-rail-button--on" : ""}`}
          title="Command"
          aria-label="Command"
        >
          <CommandIcon size={17} />
        </button>
        <span className="node-menu-divider" aria-hidden />
        {hub.slots.map((slot) => {
          const ext = slot.occupiedBy ? hub.extensions.find((e) => e.manifest.id === slot.occupiedBy) : undefined;
          const openSlot = canUseSlot(slot, hub.entitlement);
          const name = ext?.manifest.name ?? placeholderName(slot.placeholderKey);
          const state = ext ? "live" : openSlot ? "open" : "locked";
          const selected = ext && isPanel(surface.panel, { extension: ext.manifest.id });
          return (
            <button
              key={slot.id}
              type="button"
              tabIndex={open ? 0 : -1}
              onClick={() => onSlot(slot.id)}
              className={`node-rail-button node-rail-button--${state} ${selected ? "node-rail-button--on" : ""}`}
              title={ext ? `${name} · live` : openSlot ? `${slot.tier === "pro" ? "Pro" : "Free"} socket · open (${name})` : `Pro socket · ${name}`}
              aria-label={ext ? `${name}, wired in` : openSlot ? `Open ${slot.tier} socket, reserved for ${name}` : `Locked Pro socket, reserved for ${name}`}
            >
              {ext ? (
                <span className="text-[11px] font-semibold">{ext.manifest.monogram ?? name.slice(0, 2)}</span>
              ) : openSlot ? (
                <PlusIcon size={14} />
              ) : (
                <LockIcon size={13} />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
