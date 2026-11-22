"use client";

import { memo, useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { Blocks, LogOut, RotateCcw, Settings, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CINEMA_NODE_ID } from "@/extensions/cinema/node";
import { STUDIO_NODE_ID } from "@/extensions/studio/node";
import { signOutAction } from "@/lib/auth/actions";
import {
  FREE_ACTIVE_EXTENSION_SLOTS,
  canUseSlot,
  placeholderName,
  type ExtensionHubSnapshot,
  type ExtensionId,
  type SlotId,
} from "@/lib/extensions";
import { useTheme } from "@/lib/theme";
import { CommandIcon, LockIcon, MoonIcon, NetworkIcon, NodesIcon, PlusIcon, SunIcon, TodayIcon } from "./icons";

export type PanelId = "today" | "nodes" | "settings" | { extension: ExtensionId };

export type Surface = { view: "home" | "research" | "command" | "studio" | "cinema" | "nodes"; panel: PanelId | null };

const isPanel = (panel: PanelId | null, id: PanelId) =>
  typeof id === "string" ? panel === id : typeof panel === "object" && panel?.extension === id.extension;

function MenuItem({
  label,
  tooltip,
  active,
  onClick,
  children,
}: {
  label: string;
  tooltip?: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const btn = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`node-menu-item ${active ? "node-menu-item--on" : ""}`}
    >
      <span className="node-menu-icon">{children}</span>
      <span className="node-menu-label">{label}</span>
    </button>
  );

  if (!tooltip) return btn;
  return (
    <Tooltip>
      <TooltipTrigger render={btn} />
      <TooltipContent side="right" sideOffset={10}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function assignRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}

/** Left menu: docked on full-screen views; extends from the top-left button on the network stage. */
export const NodeMenu = memo(function NodeMenu({
  id,
  hub,
  surface,
  floating = false,
  open = true,
  previewAllNodes = false,
  navRef,
  onHome,
  onCommand,
  onNodes,
  onPanel,
  onReplaySetup,
  onTogglePreviewAllNodes,
}: {
  id?: string;
  hub: ExtensionHubSnapshot;
  surface: Surface;
  floating?: boolean;
  open?: boolean;
  previewAllNodes?: boolean;
  navRef?: RefObject<HTMLElement | null>;
  onHome: () => void;
  onCommand: () => void;
  onNodes: () => void;
  onPanel: (panel: PanelId) => void;
  onReplaySetup?: () => void;
  onTogglePreviewAllNodes?: () => void;
}) {
  const { theme, toggleTheme } = useTheme();

  const live = hub.slots.flatMap((slot) => {
    const ext = slot.occupiedBy ? hub.extensions.find((e) => e.manifest.id === slot.occupiedBy) : undefined;
    return ext ? [ext] : [];
  });
  const used = live.length;
  const cap = hub.entitlement.isPro ? hub.slots.length : FREE_ACTIVE_EXTENSION_SLOTS;

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
      <MenuItem
        label="Network"
        tooltip="Network stage"
        active={surface.view === "home" && !surface.panel}
        onClick={onHome}
      >
        <NetworkIcon />
      </MenuItem>
      <MenuItem
        label="Command"
        tooltip="Command hub"
        active={surface.view === "command"}
        onClick={onCommand}
      >
        <CommandIcon />
      </MenuItem>
      <MenuItem
        label="Today"
        tooltip="Today & priorities"
        active={isPanel(surface.panel, "today")}
        onClick={() => onPanel("today")}
      >
        <TodayIcon />
      </MenuItem>
      <MenuItem
        label="Nodes"
        tooltip="Spatial nodes studio"
        active={surface.view === "nodes" || isPanel(surface.panel, "nodes")}
        onClick={onNodes}
      >
        <NodesIcon />
      </MenuItem>
      {live.length > 0 ? <span className="node-menu-divider" aria-hidden /> : null}
      {live.map((ext) => (
        <MenuItem
          key={ext.manifest.id}
          label={ext.manifest.name}
          tooltip={ext.manifest.name}
          active={
            isPanel(surface.panel, { extension: ext.manifest.id }) ||
            (ext.manifest.id === STUDIO_NODE_ID && surface.view === "studio") ||
            (ext.manifest.id === CINEMA_NODE_ID && surface.view === "cinema")
          }
          onClick={() => onPanel({ extension: ext.manifest.id })}
        >
          <span className="text-[11px] font-semibold">{ext.manifest.monogram ?? ext.manifest.name.slice(0, 2)}</span>
        </MenuItem>
      ))}
      {floating ? <span className="node-menu-divider" aria-hidden /> : <div className="flex-1" />}
      <MenuItem
        label={theme === "dark" ? "Light" : "Dark"}
        tooltip={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        active={false}
        onClick={toggleTheme}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </MenuItem>

      <TierMenu
        key={!floating || open ? "active" : "collapsed"}
        hub={hub}
        used={used}
        cap={cap}
        disabled={floating && !open}
        previewAllNodes={previewAllNodes}
        onNodes={onNodes}
        onPanel={onPanel}
        onReplaySetup={onReplaySetup}
        onTogglePreviewAllNodes={onTogglePreviewAllNodes}
      />
    </nav>
  );
});

function TierMenu({
  hub,
  used,
  cap,
  disabled,
  previewAllNodes = false,
  onNodes,
  onPanel,
  onReplaySetup,
  onTogglePreviewAllNodes,
}: {
  hub: ExtensionHubSnapshot;
  used: number;
  cap: number;
  disabled: boolean;
  previewAllNodes?: boolean;
  onNodes: () => void;
  onPanel: (panel: PanelId) => void;
  onReplaySetup?: () => void;
  onTogglePreviewAllNodes?: () => void;
}) {
  const [tierMenuOpen, setTierMenuOpen] = useState(false);
  const showTierMenu = tierMenuOpen && !disabled;
  const filledPips = used > 0 ? Math.max(1, Math.min(5, Math.round((used / Math.max(cap, 1)) * 5))) : 0;

  return (
    <div className="relative flex w-full justify-center">
      <DropdownMenu
        open={showTierMenu}
        onOpenChange={(next) => {
          if (!disabled) setTierMenuOpen(next);
        }}
      >
        <Tooltip disabled={showTierMenu}>
          <TooltipTrigger
            render={(tooltipProps) => (
              <DropdownMenuTrigger
                render={(menuProps) => (
                  <button
                    {...mergeProps<"button">(tooltipProps, menuProps)}
                    ref={assignRefs(
                      (tooltipProps as { ref?: Ref<HTMLButtonElement> }).ref,
                      (menuProps as { ref?: Ref<HTMLButtonElement> }).ref,
                    )}
                    type="button"
                    className={`node-menu-plan ${showTierMenu ? "node-menu-plan--on" : ""}`}
                    aria-label={`Plan & account menu (${used} of ${cap} sockets used)`}
                  >
                    <span className="flex gap-[3px]" aria-hidden>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={`h-1 w-1.5 rounded-full ${
                            i < filledPips ? "bg-[color:var(--land-gold)]" : "bg-[color:var(--land-line)]"
                          }`}
                        />
                      ))}
                    </span>
                    <span>{hub.entitlement.isPro ? "Pro" : "Free"}</span>
                  </button>
                )}
              />
            )}
          />
          <TooltipContent side="right" sideOffset={10}>
            {used} of {cap} sockets in use
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={10}
          className="w-64 rounded-2xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-2xl ring-0 backdrop-blur-2xl"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2.5 py-2 font-normal">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-foreground">
                  {hub.entitlement.isPro ? "Nexus Pro · preview" : "Free tier"}
                </span>
                <Badge variant="outline" className="h-5 px-2 font-mono text-[10px] tracking-wider tabular-nums">
                  {used}/{cap}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                {hub.entitlement.isPro
                  ? `${used} of ${hub.slots.length} sockets in use`
                  : `${used} of ${FREE_ACTIVE_EXTENSION_SLOTS} free sockets in use`}
              </p>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10" aria-hidden>
                <div
                  className="h-full rounded-full bg-[color:var(--land-gold)] transition-all duration-300"
                  style={{ width: `${Math.min(100, (used / Math.max(cap, 1)) * 100)}%` }}
                />
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuGroup>
            <DropdownMenuItem
              className="cursor-pointer rounded-xl px-2.5 py-2 text-[13px]"
              onClick={() => {
                setTierMenuOpen(false);
                onNodes();
              }}
            >
              <Blocks className="size-4 text-muted-foreground" />
              <span>Manage nodes</span>
            </DropdownMenuItem>

            {onTogglePreviewAllNodes ? (
              <DropdownMenuItem
                className="cursor-pointer rounded-xl px-2.5 py-2 text-[13px]"
                onClick={() => {
                  onTogglePreviewAllNodes();
                  setTierMenuOpen(false);
                }}
              >
                <Sparkles className="size-4 text-[color:var(--land-gold)]" />
                <span>{previewAllNodes ? "Exit all-nodes preview" : "Preview all nodes"}</span>
              </DropdownMenuItem>
            ) : null}

            {onReplaySetup ? (
              <DropdownMenuItem
                className="cursor-pointer rounded-xl px-2.5 py-2 text-[13px]"
                onClick={() => {
                  setTierMenuOpen(false);
                  onReplaySetup();
                }}
              >
                <RotateCcw className="size-4 text-muted-foreground" />
                <span>Setup wizard</span>
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuItem
              className="cursor-pointer rounded-xl px-2.5 py-2 text-[13px]"
              onClick={() => {
                setTierMenuOpen(false);
                onPanel("settings");
              }}
            >
              <Settings className="size-4 text-muted-foreground" />
              <span>Settings</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="my-1" />

          <form action={signOutAction} className="w-full">
            <DropdownMenuItem
              variant="destructive"
              className="w-full cursor-pointer rounded-xl px-2.5 py-2 text-[13px]"
              nativeButton
              render={<button type="submit" />}
            >
              <LogOut className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Right rail: minimizes into a slim bar at the right edge and slides out on mouse hover. */
export const NodeRail = memo(function NodeRail({
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

  const occupiedSlots = hub.slots.filter((slot) => Boolean(slot.occupiedBy));
  const firstOpenSlot = hub.slots.find((slot) => !slot.occupiedBy && canUseSlot(slot, hub.entitlement));
  const firstLockedSlot = hub.slots.find((slot) => !slot.occupiedBy && !canUseSlot(slot, hub.entitlement));
  const actionSlot = firstOpenSlot ?? firstLockedSlot ?? null;

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
          {occupiedSlots.slice(0, 8).map((slot) => (
            <span key={slot.id} className="node-rail-pip node-rail-pip--live" />
          ))}
          {actionSlot ? (
            <span
              className={`node-rail-pip node-rail-pip--${firstOpenSlot ? "open" : "locked"}`}
            />
          ) : null}
        </span>
      </button>

      <nav aria-label="Quick access" aria-hidden={!open} className="node-rail node-rail--sliding">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onCommand}
                tabIndex={open ? 0 : -1}
                className={`node-rail-button node-rail-button--core ${surface.view === "command" ? "node-rail-button--on" : ""}`}
                aria-label="Command"
              >
                <CommandIcon size={17} />
              </button>
            }
          />
          <TooltipContent side="left" sideOffset={10}>
            Command
          </TooltipContent>
        </Tooltip>

        <span className="node-menu-divider" aria-hidden />

        {occupiedSlots.map((slot) => {
          const ext = hub.extensions.find((e) => e.manifest.id === slot.occupiedBy);
          if (!ext) return null;
          const name = ext.manifest.name;
          const selected =
            isPanel(surface.panel, { extension: ext.manifest.id }) ||
            (ext.manifest.id === STUDIO_NODE_ID && surface.view === "studio") ||
            (ext.manifest.id === CINEMA_NODE_ID && surface.view === "cinema");
          return (
            <Tooltip key={slot.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    tabIndex={open ? 0 : -1}
                    onClick={() => onSlot(slot.id)}
                    className={`node-rail-button node-rail-button--live ${selected ? "node-rail-button--on" : ""}`}
                    aria-label={`${name}, wired in`}
                  >
                    <span className="text-[11px] font-semibold">
                      {ext.manifest.monogram ?? name.slice(0, 2)}
                    </span>
                  </button>
                }
              />
              <TooltipContent side="left" sideOffset={10}>
                {name} · live
              </TooltipContent>
            </Tooltip>
          );
        })}

        {actionSlot ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  tabIndex={open ? 0 : -1}
                  onClick={() => onSlot(actionSlot.id)}
                  className={`node-rail-button node-rail-button--${firstOpenSlot ? "open" : "locked"}`}
                  aria-label={
                    firstOpenSlot
                      ? `Add extension to open slot (${placeholderName(firstOpenSlot.placeholderKey)})`
                      : `Unlock more branch sockets with Pro`
                  }
                >
                  {firstOpenSlot ? <PlusIcon size={14} /> : <LockIcon size={13} />}
                </button>
              }
            />
            <TooltipContent side="left" sideOffset={10}>
              {firstOpenSlot
                ? `Add node · ${hub.slots.length} total slots`
                : `Explore all ${hub.slots.length} branch slots`}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </nav>
    </div>
  );
});
